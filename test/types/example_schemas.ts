import type { Double, Int32 } from '../../src';

export type MediaType = 'movie' | 'tv' | 'web series';

export interface Movie {
  title: string;
  year: Int32;
  runtime: number;
  released: Date;
  poster: string;
  plot: string;
  fullPlot: string;
  lastUpdated: Date;
  type: MediaType;
  directors: string[];
  imdb: {
    rating: Double;
    votes: number;
    id: number;
  };
  countries: string[];
  genres: string[];
  tomatoes: {
    viewer: {
      rating: number;
      numReviews: number;
    };
    lastUpdated: Date;
  };
  num_mflix_comments: number;
}
