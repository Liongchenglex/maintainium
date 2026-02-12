import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  pgEnum,
  jsonb,
  unique,
} from 'drizzle-orm/pg-core';
import { projects } from './projects';

export const scanStatusEnum = pgEnum('scan_status', [
  'pending',
  'scanning',
  'completed',
  'failed',
]);

export const scanTriggerEnum = pgEnum('scan_trigger', [
  'manual',
  'auto',
  'scheduled',
]);

export const findingSeverityEnum = pgEnum('finding_severity', [
  'critical',
  'high',
  'medium',
  'low',
  'info',
]);

export const findingStatusEnum = pgEnum('finding_status', [
  'open',
  'resolved',
  'dismissed',
]);

export const monitorScans = pgTable('monitor_scans', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id),
  status: scanStatusEnum('status').notNull().default('pending'),
  trigger: scanTriggerEnum('trigger').notNull().default('manual'),
  scannersRun: text('scanners_run').array(),
  totalFindings: integer('total_findings').default(0),
  newFindings: integer('new_findings').default(0),
  resolvedFindings: integer('resolved_findings').default(0),
  durationMs: integer('duration_ms'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const scanFindings = pgTable(
  'scan_findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    scanId: uuid('scan_id')
      .notNull()
      .references(() => monitorScans.id),
    scanner: text('scanner').notNull(),
    fingerprint: text('fingerprint').notNull(),
    severity: findingSeverityEnum('severity').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    details: jsonb('details'),
    status: findingStatusEnum('status').notNull().default('open'),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('scan_findings_project_fingerprint_unique').on(
      table.projectId,
      table.fingerprint,
    ),
  ],
);

export type MonitorScan = typeof monitorScans.$inferSelect;
export type NewMonitorScan = typeof monitorScans.$inferInsert;
export type ScanFinding = typeof scanFindings.$inferSelect;
export type NewScanFinding = typeof scanFindings.$inferInsert;
