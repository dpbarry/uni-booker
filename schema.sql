CREATE DATABASE uni_booker;
USE uni_booker;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(100),
  role VARCHAR(20)
);

CREATE TABLE slots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date DATE,
  time TIME,
  status VARCHAR(20)
);

CREATE TABLE bookings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT,
  slot_id INT
);
