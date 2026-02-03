-- Migration to add progressive unlock feature
-- This feature allows teachers to enable sequential unlocking of content items
-- Students must complete items in order, and certain items can be locked after completion

-- Add enable_progressive_unlock to classes table
ALTER TABLE classes 
ADD COLUMN IF NOT EXISTS enable_progressive_unlock BOOLEAN NOT NULL DEFAULT false;

-- Add comment explaining the enable_progressive_unlock field
COMMENT ON COLUMN classes.enable_progressive_unlock IS 'When true, students can only access content items sequentially. The first item is unlocked by default, and subsequent items unlock when the previous item is marked complete.';

-- Add lock_after_complete to content_items table
ALTER TABLE content_items
ADD COLUMN IF NOT EXISTS lock_after_complete BOOLEAN NOT NULL DEFAULT false;

-- Add comment explaining the lock_after_complete field
COMMENT ON COLUMN content_items.lock_after_complete IS 'When true, this content item becomes inaccessible to students after they mark it as complete. Used in conjunction with progressive unlock to prevent students from reviewing certain content.';

-- Verify the changes
SELECT table_name, column_name, data_type, column_default 
FROM information_schema.columns 
WHERE (table_name = 'classes' AND column_name = 'enable_progressive_unlock')
   OR (table_name = 'content_items' AND column_name = 'lock_after_complete');
