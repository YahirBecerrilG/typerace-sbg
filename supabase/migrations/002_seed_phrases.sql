-- ============================================================
-- TypeRacing Phrase Seed
-- Run AFTER 001_initial.sql
-- ============================================================

INSERT INTO phrases (text, difficulty, category) VALUES

-- ── EASY ─────────────────────────────────────────────────────
('The quick brown fox jumps over the lazy dog.', 'easy', 'general'),
('Type fast and win the race today.', 'easy', 'general'),
('Practice makes perfect in every skill you learn.', 'easy', 'motivation'),
('The sun rises in the east and sets in the west.', 'easy', 'general'),
('Hard work and dedication lead to great success.', 'easy', 'motivation'),
('Read more books and expand your knowledge daily.', 'easy', 'motivation'),
('Time is the most valuable resource we all have.', 'easy', 'motivation'),
('A journey of a thousand miles begins with one step.', 'easy', 'motivation'),
('Simple code is better than complex code every time.', 'easy', 'programming'),
('Every expert was once a beginner who never gave up.', 'easy', 'motivation'),

-- ── MEDIUM ───────────────────────────────────────────────────
('The future belongs to those who believe in the beauty of their dreams.', 'medium', 'motivation'),
('Success is not final, failure is not fatal: it is the courage to continue that counts.', 'medium', 'motivation'),
('JavaScript is a dynamic programming language that runs in the browser and on the server.', 'medium', 'programming'),
('The universe is under no obligation to make sense to you, but it rewards curiosity.', 'medium', 'science'),
('In software engineering, clean code is code that is easy to understand and maintain.', 'medium', 'programming'),
('The best way to predict the future is to invent it with hard work and creativity.', 'medium', 'motivation'),
('Artificial intelligence is transforming the way we live, work, and communicate each day.', 'medium', 'technology'),
('Quantum mechanics describes the behavior of particles at the atomic and subatomic scale.', 'medium', 'science'),
('Do not watch the clock. Do what it does. Keep going until you reach your goal today.', 'medium', 'motivation'),
('The Internet connects billions of devices worldwide and enables instant communication.', 'medium', 'technology'),
('A database is an organized collection of structured information stored and accessed electronically.', 'medium', 'technology'),
('Recursion is a programming technique where a function calls itself to solve a problem.', 'medium', 'programming'),

-- ── HARD ─────────────────────────────────────────────────────
('The asymptotic complexity of an algorithm describes its behavior as the input size approaches infinity.', 'hard', 'programming'),
('Neuroplasticity, the brain''s ability to reorganize itself by forming new neural connections, enables continuous learning.', 'hard', 'science'),
('Cryptographic hash functions are deterministic one-way algorithms that map arbitrary-size data to fixed-size output values.', 'hard', 'technology'),
('The Heisenberg uncertainty principle states that the position and momentum of a particle cannot be simultaneously measured.', 'hard', 'science'),
('Distributed systems must contend with partial failures, network partitions, and the CAP theorem''s fundamental trade-offs.', 'hard', 'technology'),
('In functional programming, pure functions always produce the same output for identical inputs without side effects.', 'hard', 'programming'),
('The polymorphic nature of object-oriented languages allows derived classes to override inherited methods and behaviors.', 'hard', 'programming'),
('Thermodynamics governs the relationships between heat, work, temperature, and energy in physical and chemical systems.', 'hard', 'science'),
('Machine learning models learn patterns from training data and generalize to unseen examples through statistical optimization.', 'hard', 'technology'),
('Synaptic plasticity—the ability of synapses to strengthen or weaken over time—is the cellular basis of memory and learning.', 'hard', 'science'),
('The Byzantine fault tolerance problem requires distributed systems to reach consensus even when some nodes behave maliciously.', 'hard', 'technology'),
('Event-driven architectures decouple producers and consumers of information, enabling scalable and maintainable microservices.', 'hard', 'programming');
