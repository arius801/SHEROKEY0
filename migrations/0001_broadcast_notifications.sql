-- Migration: Add broadcast notifications table for admin announcements
-- This allows owners to send notifications to all customers or selected groups

CREATE TABLE IF NOT EXISTS broadcast_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  type VARCHAR(40) NOT NULL, -- discount, offer, coupon, announcement, new_product, maintenance, general
  recipient_type VARCHAR(20) NOT NULL, -- all, selected
  recipient_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS broadcast_notif_type_idx ON broadcast_notifications(type);
CREATE INDEX IF NOT EXISTS broadcast_notif_created_idx ON broadcast_notifications(created_at DESC);
