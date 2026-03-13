-- innovation_exchange database schema

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ideas table
CREATE TABLE IF NOT EXISTS ideas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    current_layer INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Idea layers (for Controlled Idea Disclosure)
CREATE TABLE IF NOT EXISTS idea_layers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    idea_id INT NOT NULL,
    layer_number INT NOT NULL,
    content TEXT NOT NULL,
    access_conditions TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE
);

-- Idea ownership ledger (IOL)
CREATE TABLE IF NOT EXISTS idea_ownership_ledger (
    id INT AUTO_INCREMENT PRIMARY KEY,
    idea_id INT NOT NULL,
    owner_id INT NOT NULL,
    transaction_type VARCHAR(50) NOT NULL,
    details TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Idea disclosure logs
CREATE TABLE IF NOT EXISTS idea_disclosure_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    idea_id INT NOT NULL,
    viewer_id INT NOT NULL,
    layer_number INT NOT NULL,
    access_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE,
    FOREIGN KEY (viewer_id) REFERENCES users(id) ON DELETE CASCADE
);