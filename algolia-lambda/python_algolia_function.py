import base64
import datetime
import json
import logging
import os
import time
import traceback
from urllib.parse import urlparse, quote
from boto3.dynamodb.types import TypeDeserializer
from algoliasearch.search_client import SearchClient

# Logger
logger = logging.getLogger()
logger.setLevel(logging.DEBUG if os.getenv('DEBUG', default = 1) else logging.INFO)
logger.info("Update Algolia")

# Algolia
ALGOLIA_FIELDS_MAP = ''
try:
    fields_var = os.getenv('ALGOLIA_FIELDS_MAP')
    if fields_var:
        ALGOLIA_FIELDS_MAP = json.loads(fields_var)
        logger.debug('FieldsMap: %s', ALGOLIA_FIELDS_MAP)
except:
    logger.exception("Fields map parsing error")
    raise ValueError('If you specify fields, it must be a valid json object.')

if ALGOLIA_FIELDS_MAP:
    for key, value in ALGOLIA_FIELDS_MAP.items():
        if 'include' in value and 'exclude' in value:
            raise ValueError('If you specify fields, it must be an object with EITHER field: "include" OR "exclude".')
        if 'include' not in value and 'exclude' not in value:
            raise ValueError('If you specify fields, it must be an object with EITHER field: "include" OR "exclude".')

ALGOLIA_SETTINGS_MAP = {}
try:
    settings_var = os.getenv('ALGOLIA_SETTINGS_MAP')
    if settings_var:
        ALGOLIA_SETTINGS_MAP = json.loads(settings_var)
        logger.debug('SettingsMap: %s', ALGOLIA_SETTINGS_MAP)
except:
    raise ValueError('If you specify settings, it must at least have an object of settings.')

ALGOLIA_APP_ID = os.getenv('ALGOLIA_APP_ID', default = '')
ALGOLIA_API_KEY = os.getenv('ALGOLIA_API_KEY', default = '')
if ALGOLIA_APP_ID == '' or ALGOLIA_API_KEY == '':
    raise ValueError('You need to provide ALGOLIA_APP_ID and ALGOLIA_API_KEY env variables.')

client = SearchClient.create(ALGOLIA_APP_ID, ALGOLIA_API_KEY)

# custom encoder changes
# - sets to lists
class DDBTypesEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, set):
            return list(obj)
        return json.JSONEncoder.default(self, obj)

# Subclass of boto's TypeDeserializer for DynamoDB to adjust for DynamoDB Stream format.
class StreamTypeDeserializer(TypeDeserializer):
    def _deserialize_b(self, value):
        return value  # Already in Base64

# Extracts the DynamoDB table from an ARN
# ex: arn:aws:dynamodb:eu-west-1:123456789012:table/table-name/stream/2015-11-13T09:23:17.104 should return 'table-name'
def get_table_name_from_arn(arn):
    return arn.split(':')[5].split('/')[1]

# Configure Index Settings
# https://www.algolia.com/doc/api-reference/settings-api-parameters/
def set_index_settings(index_name, opts):
    if not opts:
        return
    logger.debug('Configuring Index: %s', opts)
    if 'settings' not in opts:
        raise ValueError('You need to provide settings.settings object if specifying settings.')
    settings = opts['settings']
    opts.pop('settings')
    index = client.init_index(index_name)
    index.set_settings(settings, opts).wait()

# Configure Indexed Fields
# https://www.algolia.com/doc/guides/sending-and-managing-data/prepare-your-data/how-to/reducing-object-size/
def set_indexed_fields(type_name, all_fields):
    fields = {}
    logger.info(type_name)
    logger.info(ALGOLIA_FIELDS_MAP)
    if not type_name in ALGOLIA_FIELDS_MAP:
        logger.debug('Indexed Fields: %s', all_fields)
        return all_fields
    if 'include' in ALGOLIA_FIELDS_MAP[type_name]:
        key_set = set(ALGOLIA_FIELDS_MAP[type_name]['include']) & set(all_fields.keys())
        fields = { key: all_fields[key] for key in key_set }      
    elif 'exclude' in ALGOLIA_FIELDS_MAP[type_name]:
        key_set = set(all_fields.keys()) - set(ALGOLIA_FIELDS_MAP[type_name]['exclude'])
        fields = {key: all_fields[key] for key in key_set}
    logger.debug('Indexed Fields: %s', fields)
    return fields

# ObjectID = PrimaryKey(:SortKey)
def generateObjectID(keys):
    objectID = ''
    objectID = ":".join(map(lambda key: str(keys[key]), keys))
    return objectID

# Lamba Handler
def _lambda_handler(event, context):
    logger.debug('Event: %s', event)
    records = event['Records']
    now = datetime.datetime.utcnow()

    ddb_deserializer = StreamTypeDeserializer()
    operations = []
    cnt_insert = cnt_modify = cnt_remove = 0

    # Process each record
    for record in records:
        # Handle both native DynamoDB Streams or Streams data from Kinesis (for manual replay)
        logger.debug('Record: %s', record)
        if record.get('eventSource') == 'aws:dynamodb':
            ddb = record['dynamodb']
            ddb_table_name = get_table_name_from_arn(record['eventSourceARN'])
            doc_seq = ddb['SequenceNumber']
        elif record.get('eventSource') == 'aws:kinesis':
            ddb = json.loads(base64.b64decode(record['kinesis']['data']))
            ddb_table_name = ddb['SourceTable']
            doc_seq = record['kinesis']['sequenceNumber']
        else:
            logger.error('Ignoring non-DynamoDB event sources: %s',
                        record.get('eventSource'))
            continue

        # Compute DynamoDB table, type and index for item
        doc_table = ddb_table_name.lower()

        # Dispatch according to event TYPE
        event_name = record['eventName'].upper()  # INSERT, MODIFY, REMOVE
        logger.debug('doc_table=%s, event_name=%s, seq=%s', doc_table, event_name, doc_seq)

        # Treat events from a Kinesis stream as INSERTs
        if event_name == 'AWS:KINESIS:RECORD':
            event_name = 'INSERT'

        # Ensure stream has required info
        is_ddb_insert_or_update = (event_name == 'INSERT') or (event_name == 'MODIFY')
        is_ddb_delete = event_name == 'REMOVE'
        image_name = 'NewImage' if is_ddb_insert_or_update else 'Keys'

        if image_name not in ddb:
            logger.warning(
                'Cannot process stream if it does not contain ' + image_name)
            continue
        logger.debug(image_name + ': %s', ddb[image_name])
        
        # Deserialize DynamoDB type to Python types
        doc_keys = ddb_deserializer.deserialize({'M': record['dynamodb']['Keys']})
        doc_fields = ddb_deserializer.deserialize({'M': ddb[image_name]})
        logger.debug('All Fields: %s', doc_fields)
        type_name = doc_fields["__typename"]
        doc_fields = set_indexed_fields(type_name, doc_fields)
            
        # Update counters
        if event_name == 'INSERT':
            cnt_insert += 1
        elif event_name == 'MODIFY':
            cnt_modify += 1
        elif event_name == 'REMOVE':
            cnt_remove += 1
        else:
            logger.warning('Unsupported event_name: %s', event_name)

        # Format as Algolia record
        # [https://www.algolia.com/doc/guides/sending-and-managing-data/prepare-your-data/in-depth/what-is-in-a-record/]
        doc_fields['objectID'] = generateObjectID(doc_keys)

        # DynamoDB INSERT or MODIFY 
        if is_ddb_insert_or_update:
            operation = {   
                'action': 'updateObject',
                'indexName': doc_table,
                'body': doc_fields
            }

        # DynamoDB REMOVE
        elif is_ddb_delete:
            operation = {   
                'action': 'deleteObject',
                'indexName': doc_table,
                'body': doc_fields
            }
        
        # Save operation
        logger.debug('%s', operation)
        operations.append(operation);

    # Update Index Settings
    set_index_settings(doc_table, ALGOLIA_SETTINGS_MAP.get(type_name, ""))

    # Execute Batch Operations 
    # [https://www.algolia.com/doc/api-reference/api-methods/batch/]
    logger.info('Posting to Algolia: inserts=%s updates=%s deletes=%s, total operations=%s', cnt_insert, cnt_modify, cnt_remove, len(operations) - 1)
    client.multiple_batch(operations).wait()


# Global lambda handler - catches all exceptions to avoid dead letter in the DynamoDB Stream
def lambda_handler(event, context):
    try:
        return _lambda_handler(event, context)
    except Exception:
        logger.error(traceback.format_exc())