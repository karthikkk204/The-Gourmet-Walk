CREATE DATABASE IF NOT EXISTS gourmet_walk
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE gourmet_walk;

CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(20) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  category VARCHAR(60) NOT NULL,
  image_url VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inquiries (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL,
  phone VARCHAR(40),
  experience_types JSON NOT NULL,
  preferred_date DATE,
  party_size SMALLINT UNSIGNED,
  dietary_requirements VARCHAR(100) NOT NULL DEFAULT 'None',
  notes TEXT,
  status ENUM('new', 'contacted', 'confirmed', 'closed') NOT NULL DEFAULT 'new',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX inquiries_email_idx (email),
  INDEX inquiries_created_at_idx (created_at)
);

INSERT INTO products (id, name, price, category, image_url, description, sort_order) VALUES
  ('p1', 'Regional Flavor Maps', 90.00, 'Cookbooks', '/images/p1.jpg', 'A beautifully illustrated guide to the flavors and traditions of the region.', 1),
  ('p2', 'The Artisan Pantry', 45.00, 'Gourmet Foods', '/images/p2.jpg', 'A curated collection of pantry staples from independent makers.', 2),
  ('p3', 'Global Street Bites', 55.00, 'Cookbooks', '/images/p3.jpg', 'Stories and recipes inspired by the world’s most memorable street food.', 3),
  ('p4', 'Copper Tasting Spoon', 30.00, 'Culinary Merchandise', '/images/p4.jpg', 'A hand-finished copper spoon for thoughtful tastings.', 4),
  ('p5', 'Olivewood Serving Board', 85.00, 'Culinary Merchandise', '/images/p5.jpg', 'A one-of-a-kind serving board crafted from olivewood.', 5),
  ('p6', 'Canvas Market Tote', 25.00, 'Culinary Merchandise', '/images/p6.jpg', 'A sturdy everyday tote for market finds and culinary essentials.', 6),
  ('p7', 'Aged Balsamic Glaze', 70.00, 'Gourmet Foods', '/images/p7.jpg', 'A rich, slow-aged balsamic glaze from a family-run producer.', 7),
  ('p8', 'Smoked Sea Salt', 20.00, 'Gourmet Foods', '/images/p8.jpg', 'Small-batch sea salt gently smoked for a deep, savory finish.', 8),
  ('p9', 'Artisan Truffle Honey', 60.00, 'Gourmet Foods', '/images/p9.jpg', 'Fragrant local honey infused with earthy seasonal truffle.', 9)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  price = VALUES(price),
  category = VALUES(category),
  image_url = VALUES(image_url),
  description = VALUES(description),
  sort_order = VALUES(sort_order);
