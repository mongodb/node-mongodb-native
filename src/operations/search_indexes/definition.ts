import type { Document } from 'bson';

/* Token Filters */

/** @public */
export type AsciiFoldingTokenFilter = {
  type: 'asciiFolding';
  originalTokens?: 'include' | 'omit';
};

/** @public */
export type DaitchMokotoffSoundexTokenFilter = {
  type: 'daitchMokotoffSoundex';
  originalTokens?: 'include' | 'omit';
};

/** @public */
export type EdgeGramTokenFilter = {
  type: 'edgeGram';
  minGram: number;
  maxGram: number;
  termNotInBounds?: 'include' | 'omit';
};

/** @public */
export type EnglishPossessiveTokenFilter = {
  type: 'englishPossessive';
};

/** @public */
export type FlattenGraphTokenFilter = {
  type: 'flattenGraph';
};

/** @public */
export type IcuFoldingTokenFilter = {
  type: 'icuFolding';
};

/** @public */
export type IcuNormalizerTokenFilter = {
  type: 'icuNormalizer';
  normalizationForm?: 'nfd' | 'nfc' | 'nfkd' | 'nfkc';
};

/** @public */
export type KStemmingTokenFilter = {
  type: 'kStemming';
};

/** @public */
export type LengthTokenFilter = {
  type: 'length';
  min?: number;
  max?: number;
};

/** @public */
export type LowercaseTokenFilter = {
  type: 'lowercase';
};

/** @public */
export type NgramTokenFilter = {
  type: 'nGram';
  minGram: number;
  maxGram: number;
  termNotInBounds?: 'include' | 'omit';
};

/** @public */
export type PorterStemmingTokenFilter = {
  type: 'porterStemming';
};

/** @public */
export type RegexTokenFilter = {
  type: 'regex';
  pattern: string;
  replacement: string;
  matches: 'all' | 'first';
};

/** @public */
export type ReverseTokenFilter = {
  type: 'reverse';
};

/** @public */
export type ShingleTokenFilter = {
  type: 'shingle';
  minShingleSize: number;
  maxShingleSize: number;
};

/** @public */
export type SnowballStemmingTokenFilter = {
  type: 'snowballStemming';
  stemmerName:
    | 'arabic'
    | 'armenian'
    | 'basque'
    | 'catalan'
    | 'danish'
    | 'dutch'
    | 'english'
    | 'estonian'
    | 'finnish'
    | 'french'
    | 'german'
    | 'german2'
    | 'hungarian'
    | 'irish'
    | 'italian'
    | 'kp'
    | 'lithuanian'
    | 'lovins'
    | 'norwegian'
    | 'porter'
    | 'portuguese'
    | 'romanian'
    | 'russian'
    | 'spanish'
    | 'swedish'
    | 'turkish';
};

/** @public */
export type SpanishPluralStemming = {
  type: 'spanishPluralStemming';
};

/** @public */
export type StempelTokenFilter = {
  type: 'stempel';
};

/** @public */
export type StopwordTokenFilter = {
  type: 'stopword';
  tokens: string[];
  ignoreCase?: boolean;
};

/** @public */
export type TrimTokenFilter = {
  type: 'trim';
};

/** @public */
export type WordDelimiterGraphTokenFilter = {
  type: 'wordDelimiterGraph';
  delimiterOptions?: {
    generateWordParts?: boolean;
    generateNumberParts?: boolean;
    concatenateWords?: boolean;
    concatenateNumbers?: boolean;
    concatenateAll?: boolean;
    preserveOriginal?: boolean;
    splitOnCaseChange?: boolean;
    splitOnNumerics?: boolean;
    stemEnglishPossessive?: boolean;
    ignoreKeywords?: boolean;
    protectedWords?: {
      words: string[];
      ignoreCase?: boolean;
    };
  };
};

/** @public */
export type TokenFilter =
  | AsciiFoldingTokenFilter
  | DaitchMokotoffSoundexTokenFilter
  | EdgeGramTokenFilter
  | EnglishPossessiveTokenFilter
  | FlattenGraphTokenFilter
  | IcuFoldingTokenFilter
  | IcuNormalizerTokenFilter
  | KStemmingTokenFilter
  | LengthTokenFilter
  | LowercaseTokenFilter
  | NgramTokenFilter
  | PorterStemmingTokenFilter
  | RegexTokenFilter
  | ReverseTokenFilter
  | ShingleTokenFilter
  | SnowballStemmingTokenFilter
  | SpanishPluralStemming
  | StempelTokenFilter
  | StopwordTokenFilter
  | TrimTokenFilter
  | WordDelimiterGraphTokenFilter;

/* Tokenizers */

/** @public */
export type EdgeGramTokenizer = {
  type: 'edgeGram';
  minGram: number;
  maxGram: number;
};

/** @public */
export type KeywordTokenizer = {
  type: 'keyword';
};

/** @public */
export type NGramTokenizer = {
  type: 'nGram';
  minGram: number;
  maxGram: number;
};

/** @public */
export type RegexCaptureGroupTokenizer = {
  type: 'regexCaptureGroup';
  pattern: string;
  group: number;
};

/** @public */
export type RegexSplitTokenizer = {
  type: 'regexSplit';
  pattern: string;
};

/** @public */
export type StandardTokenizer = {
  type: 'standard';
  maxTokenLength?: number;
};

/** @public */
export type UaxUrlEmailTokenizer = {
  type: 'uaxUrlEmail';
  maxTokenLength?: number;
};

/** @public */
export type WhitespaceTokenizer = {
  type: 'whitespace';
  maxTokenLength?: number;
};

/** @public */
export type Tokenizer =
  | EdgeGramTokenizer
  | KeywordTokenizer
  | NGramTokenizer
  | RegexCaptureGroupTokenizer
  | RegexSplitTokenizer
  | StandardTokenizer
  | UaxUrlEmailTokenizer
  | WhitespaceTokenizer;

/* Character filters */

/** @public */
export type HtmlStripCharFilter = {
  type: 'htmlStrip';
  ignoredTags?: string[];
};

/** @public */
export type IcuNormalizeCharFilter = {
  type: 'icuNormalize';
};

/** @public */
export type MappingCharFilter = {
  type: 'mapping';
  mappings: Record<string, string>;
};

/** @public */
export type PersianCharFilter = {
  type: 'persian';
};

/** @public */
export type CharacterFilter =
  | HtmlStripCharFilter
  | IcuNormalizeCharFilter
  | MappingCharFilter
  | PersianCharFilter;

/* Custom analyzers */

/** @public */
export type CustomAnalyzer = {
  name: string;
  charFilters?: CharacterFilter[];
  tokenizer: Tokenizer;
  tokenFilters?: TokenFilter[];
};

/* Field mappings */

/** @public */
export type AutocompleteFieldMapping = {
  type: 'autocomplete';
  analyzer?: string;
  maxGrams?: number;
  minGrams?: number;
  tokenization?: 'edgeGram' | 'rightEdgeGram' | 'nGram';
  foldDiacritics?: boolean;
};

/** @public */
export type BooleanFieldMapping = {
  type: 'boolean';
};

/** @public */
export type DateFieldMapping = {
  type: 'date';
};

/** @public */
export type DateFacetFieldMapping = {
  type: 'dateFacet';
};

/** @public */
export type DocumentFieldMapping = {
  type: 'document';
  dynamic?: boolean;
  fields: Record<string, FieldMapping>;
};

/** @public */
export type EmbeddedDocumentFieldMapping = {
  type: 'embeddedDocuments';
  dynamic?: boolean;
  fields: Record<string, FieldMapping>;
};

/** @public */
export type GeoFieldMapping = {
  type: 'geo';
  indexShapes?: boolean;
};

/** @public */
export type KnnVectorFieldMapping = {
  type: 'knnVector';
  dimensions: number;
  similarity: 'euclidean' | 'cosine' | 'dotProduct';
};

/** @public */
export type NumberFieldMapping = {
  type: 'number';
  representation?: 'int64' | 'double';
  indexIntegers?: boolean;
  indexDoubles?: boolean;
};

/** @public */
export type NumberFacetFieldMapping = {
  type: 'numberFacet';
  representation?: 'int64' | 'double';
  indexIntegers?: boolean;
  indexDoubles?: boolean;
};

/** @public */
export type ObjectIdFieldMapping = {
  type: 'objectId';
};

/** @public */
export type StringFieldMapping = {
  type: 'string';
  analyzer?: string;
  searchAnalyzer?: string;
  indexOptions?: 'docs' | 'freqs' | 'positions' | 'offsets';
  store?: boolean;
  ignoreAbove?: number;
  multi?: string;
  norms?: 'include' | 'omit';
};

/** @public */
export type StringFacetFieldMapping = {
  type: 'stringFacet';
};

/** @public */
export type TokenFieldMapping = {
  type: 'token';
  normalizer?: 'lowercase' | 'none';
};

/** @public */
export type FieldMapping =
  | AutocompleteFieldMapping
  | BooleanFieldMapping
  | DateFieldMapping
  | DateFacetFieldMapping
  | DocumentFieldMapping
  | EmbeddedDocumentFieldMapping
  | GeoFieldMapping
  | KnnVectorFieldMapping
  | NumberFieldMapping
  | NumberFacetFieldMapping
  | ObjectIdFieldMapping
  | StringFieldMapping
  | StringFacetFieldMapping
  | TokenFieldMapping;

/* stored sources */

/** @public */
export type StoredSourceIncludeDefinition = {
  include: string[];
};

/** @public */
export type StoredSourceExcludeDefinition = {
  exclude: string[];
};

/** @public */
export type StoredSourceDefinition = StoredSourceIncludeDefinition | StoredSourceExcludeDefinition;

/* synonym mapping */

/** @public */
export type SynonymMappingDefinition = {
  analyzer: string;
  name: string;
  source: {
    collection: string;
  };
};

/** @public
 * Definition of a search index.
 *
 * @remarks Only available when used against a 7.0+ Atlas cluster.
 * @see https://www.mongodb.com/docs/atlas/atlas-search/index-definitions/#std-label-ref-index-definitions
 * */
export interface SearchIndexDefinition extends Document {
  /**
   * Specifies the analyzer to apply to string fields when indexing.
   * If you omit this field, the index uses the standard analyzer.
   * */
  analyzer?: string;

  /** Specifies the Custom Analyzers to use in this index. */
  analyzers?: CustomAnalyzer[];

  /** Specifies how to index fields at different paths for this index */
  mappings: {
    /** Enables or disables dynamic mapping of fields for this index. */
    dynamic: boolean;

    /**
     * Required only if dynamic mapping is disabled.
     * Specifies the fields that you would like to index.
     */
    fields?: Record<string, FieldMapping>;
  };

  /**
   * Specifies the analyzer to apply to query text before the text is searched.
   * If you omit this field, the index uses the same analyzer specified in the analyzer field.
   * If you omit both the searchAnalyzer and the analyzer fields, the index uses the standard analyzer.
   * */
  searchAnalyzer?: string;

  /** Specifies fields in the documents to store for query-time look-ups using the returnedStoredSource option. */
  storedSource?: boolean | StoredSourceDefinition;

  /** Synonym mappings to use in your index. */
  synonyms?: SynonymMappingDefinition[];
}
