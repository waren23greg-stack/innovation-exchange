-- schema.sql: Innovation Exchange MVP

-- Ideas table
CREATE TABLE IF NOT EXISTS ideas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT
);

-- Layers table for CID
CREATE TABLE IF NOT EXISTS layers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    idea_id INT NOT NULL,
    layer_number INT NOT NULL,
    content TEXT NOT NULL,
    access_conditions ENUM('public','owner','paid') NOT NULL,
    owner_id INT,
    unlocked_users JSON,
    FOREIGN KEY (idea_id) REFERENCES ideas(id)
);