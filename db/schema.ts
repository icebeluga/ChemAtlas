import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const reviewRecords = sqliteTable("review_records", {
  ownerId: text("owner_id").notNull(),
  entityType: text("entity_type", { enum: ["question", "stimulus"] }).notNull(),
  entityId: text("entity_id").notNull(),
  status: text("status").notNull(),
  payloadJson: text("payload_json").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.ownerId, table.entityType, table.entityId] }),
  index("review_records_owner_status").on(table.ownerId, table.status, table.entityType),
]);

export const reviewHistory = sqliteTable("review_history", {
  historyId: integer("history_id").primaryKey({ autoIncrement: true }),
  ownerId: text("owner_id").notNull(),
  entityType: text("entity_type", { enum: ["question", "stimulus"] }).notNull(),
  entityId: text("entity_id").notNull(),
  revision: integer("revision").notNull(),
  eventJson: text("event_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("review_history_entity").on(table.ownerId, table.entityType, table.entityId, table.revision),
  uniqueIndex("review_history_revision_unique").on(table.ownerId, table.entityType, table.entityId, table.revision),
]);

export const cropRevisions = sqliteTable("crop_revisions", {
  ownerId: text("owner_id").notNull(),
  entityType: text("entity_type", { enum: ["question", "stimulus"] }).notNull(),
  entityId: text("entity_id").notNull(),
  revision: text("revision").notNull(),
  cropJson: text("crop_json").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  notes: text("notes").notNull().default(""),
}, (table) => [primaryKey({ columns: [table.ownerId, table.entityType, table.entityId, table.revision] })]);

export const imageObjects = sqliteTable("image_objects", {
  ownerId: text("owner_id").notNull(),
  entityType: text("entity_type", { enum: ["question", "stimulus"] }).notNull(),
  entityId: text("entity_id").notNull(),
  revision: text("revision").notNull(),
  segment: integer("segment").notNull(),
  objectKey: text("object_key").notNull(),
  byteLength: integer("byte_length").notNull(),
  sha256: text("sha256").notNull(),
  mimeType: text("mime_type").notNull().default("image/png"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.ownerId, table.entityType, table.entityId, table.revision, table.segment] }),
  uniqueIndex("image_objects_object_key").on(table.objectKey),
  index("image_objects_entity").on(table.ownerId, table.entityType, table.entityId, table.revision),
]);

export const stimulusLinks = sqliteTable("stimulus_links", {
  ownerId: text("owner_id").notNull(),
  questionId: text("question_id").notNull(),
  stimulusId: text("stimulus_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.ownerId, table.questionId, table.stimulusId] })]);
