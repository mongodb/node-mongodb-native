import { expectAssignable, expectNotAssignable } from 'tsd';

import type { SearchIndexDescription } from '../../src';

// Test to ensure valid configurations of SearchIndexDescription are allowed
expectAssignable<SearchIndexDescription>({
  name: 'mySearchIndex',
  definition: {
    mappings: {
      dynamic: true
    }
  }
});

expectAssignable<SearchIndexDescription>({
  definition: {
    analyzer: 'standard',
    searchAnalyzer: 'standard',
    mappings: {
      dynamic: false,
      fields: {
        title: { type: 'string' }
      }
    },
    storedSource: true
  }
});

expectAssignable<SearchIndexDescription>({
  definition: {
    analyzer: 'custom_analyzer',
    analyzers: [
      {
        name: 'custom_analyzer',
        tokenizer: { type: 'standard' }
      }
    ],
    mappings: {
      dynamic: false,
      fields: {
        description: { type: 'string', analyzer: 'custom_analyzer' }
      }
    },
    storedSource: {
      include: ['title', 'description']
    },
    synonyms: [
      {
        analyzer: 'standard',
        name: 'synonym_mapping',
        source: {
          collection: 'synonyms'
        }
      }
    ]
  }
});

// Test to ensure configurations missing required `definition` are invalid
expectNotAssignable<SearchIndexDescription>({});
expectNotAssignable<SearchIndexDescription>({
  name: 'incompleteDefinition'
});

// Test configurations that should not be assignable to SearchIndexDescription due to invalid `definition` structure
expectNotAssignable<SearchIndexDescription>({
  name: 'invalidDefinition',
  definition: {
    mappings: {
      dynamic: 'yes' // dynamic should be a boolean
    }
  }
});

// Test configurations with incorrect field types in `definition`
expectNotAssignable<SearchIndexDescription>({
  definition: {
    analyzer: 'standard',
    mappings: {
      dynamic: false,
      fields: {
        createdAt: { type: 'date', wrongOption: true } // 'wrongOption' is not a valid property for DateFieldMapping
      }
    }
  }
});

// Ensure that `name` as other than string is caught
expectNotAssignable<SearchIndexDescription>({
  name: 123, // name should be a string
  definition: {
    mappings: {
      dynamic: true
    }
  }
});
