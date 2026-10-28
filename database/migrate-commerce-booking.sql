USE gourmet_walk;

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reference CHAR(36) NOT NULL UNIQUE,
  idempotency_key VARCHAR(100) NOT NULL UNIQUE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  address_line_1 VARCHAR(200) NOT NULL,
  address_line_2 VARCHAR(200),
  city VARCHAR(100) NOT NULL,
  region VARCHAR(100) NOT NULL,
  postal_code VARCHAR(24) NOT NULL,
  country VARCHAR(100) NOT NULL,
  currency CHAR(3) NOT NULL,
  subtotal_minor INT UNSIGNED NOT NULL,
  tax_minor INT UNSIGNED NOT NULL,
  shipping_minor INT UNSIGNED NOT NULL,
  total_minor INT UNSIGNED NOT NULL,
  order_status ENUM('pending', 'confirmed', 'cancelled') NOT NULL DEFAULT 'pending',
  payment_status ENUM('unpaid', 'test_paid', 'paid', 'failed') NOT NULL DEFAULT 'unpaid',
  payment_provider ENUM('test', 'stripe') NOT NULL,
  confirmation_token_hash CHAR(64) NOT NULL,
  stripe_session_id VARCHAR(255) NULL UNIQUE,
  paid_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX orders_email_idx (email),
  INDEX orders_created_at_idx (created_at)
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  product_id VARCHAR(20) NOT NULL,
  product_name VARCHAR(150) NOT NULL,
  quantity SMALLINT UNSIGNED NOT NULL,
  unit_price_minor INT UNSIGNED NOT NULL,
  CONSTRAINT order_items_order_fk FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tours (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  description TEXT NOT NULL,
  price_minor INT UNSIGNED NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  duration_minutes SMALLINT UNSIGNED NOT NULL,
  minimum_guests TINYINT UNSIGNED NOT NULL DEFAULT 1,
  maximum_guests TINYINT UNSIGNED NOT NULL DEFAULT 8,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT tours_guest_limits_chk CHECK (minimum_guests >= 1 AND maximum_guests >= minimum_guests AND maximum_guests <= 50)
);

CREATE TABLE IF NOT EXISTS tour_slots (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tour_id BIGINT UNSIGNED NOT NULL,
  starts_at DATETIME NOT NULL,
  capacity SMALLINT UNSIGNED NOT NULL,
  reserved_guests SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY tour_slots_start_unique (tour_id, starts_at),
  INDEX tour_slots_available_idx (tour_id, starts_at, active),
  CONSTRAINT tour_slots_capacity_chk CHECK (capacity > 0 AND reserved_guests <= capacity),
  CONSTRAINT tour_slots_tour_fk FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS bookings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reference CHAR(36) NOT NULL UNIQUE,
  idempotency_key VARCHAR(100) NOT NULL UNIQUE,
  tour_id BIGINT UNSIGNED NOT NULL,
  slot_id BIGINT UNSIGNED NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  guest_count TINYINT UNSIGNED NOT NULL,
  dietary_requirements VARCHAR(100) NOT NULL DEFAULT 'None',
  notes TEXT,
  total_minor INT UNSIGNED NOT NULL,
  currency CHAR(3) NOT NULL,
  status ENUM('pending', 'confirmed', 'cancelled') NOT NULL DEFAULT 'pending',
  cancellation_token_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX bookings_slot_status_idx (slot_id, status),
  INDEX bookings_email_idx (email),
  INDEX bookings_created_at_idx (created_at),
  CONSTRAINT bookings_tour_fk FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE RESTRICT,
  CONSTRAINT bookings_slot_fk FOREIGN KEY (slot_id) REFERENCES tour_slots(id) ON DELETE RESTRICT
);
