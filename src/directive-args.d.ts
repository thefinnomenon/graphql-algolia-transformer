export interface FieldList {
    include?: [string];
    exclude?: [string];
  }
 export interface AlgoliaDirectiveArgs {
    fields?: FieldList;
    settings?: string;
  }