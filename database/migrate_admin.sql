USE gourmet_walk;

ALTER TABLE inquiries
  ADD COLUMN status ENUM('new', 'contacted', 'confirmed', 'closed')
  NOT NULL DEFAULT 'new'
  AFTER notes;
