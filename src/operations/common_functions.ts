import type { Document } from '../bson';
import type { Collection } from '../collection';

export function maybeAddIdToDocuments(
  coll: Collection,
  docs: Document[],
  options: { forceServerObjectId?: boolean }
): Document[];
export function maybeAddIdToDocuments(
  coll: Collection,
  docs: Document,
  options: { forceServerObjectId?: boolean }
): Document;
export function maybeAddIdToDocuments(
  coll: Collection,
  docOrDocs: Document[] | Document,
  options: { forceServerObjectId?: boolean }
): Document[] | Document {
  const forceServerObjectId =
    typeof options.forceServerObjectId === 'boolean'
      ? options.forceServerObjectId
      : coll.s.db.options?.forceServerObjectId;

  // no need to modify the docs if server sets the ObjectId
  if (forceServerObjectId === true) {
    return docOrDocs;
  }

  const transform = (doc: Document): Document => {
    if (doc._id == null) {
      doc._id = coll.s.pkFactory.createPk();
    }

    return doc;
  };
  return Array.isArray(docOrDocs) ? docOrDocs.map(transform) : transform(docOrDocs);
}
