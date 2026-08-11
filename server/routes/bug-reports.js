const express = require('express');
const db = require('../db/index');
const router = express.Router();

// GET /api/bug-reports
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT br.*, u.name as reporter_name
    FROM bug_reports br
    LEFT JOIN users u ON u.id = br.user_id
    ORDER BY br.created_at DESC
  `).all();
  res.json(rows);
});

// POST /api/bug-reports
router.post('/', (req, res) => {
  const { user_id, description, type = 'bug', page_url, page_title } = req.body;
  if (!description?.trim()) return res.status(400).json({ error: 'description required' });

  const result = db.prepare(`
    INSERT INTO bug_reports (user_id, description, type, page_url, page_title)
    VALUES (?, ?, ?, ?, ?)
  `).run(user_id ?? null, description.trim(), type, page_url ?? null, page_title ?? null);

  res.status(201).json(db.prepare('SELECT * FROM bug_reports WHERE id = ?').get(result.lastInsertRowid));
});

// PATCH /api/bug-reports/:id
router.patch('/:id', (req, res) => {
  const { status, notes } = req.body;
  db.prepare(`
    UPDATE bug_reports SET
      status = COALESCE(?, status),
      notes = COALESCE(?, notes),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(status ?? null, notes ?? null, req.params.id);
  res.json(db.prepare(`
    SELECT br.*, u.name as reporter_name FROM bug_reports br
    LEFT JOIN users u ON u.id = br.user_id WHERE br.id = ?
  `).get(req.params.id));
});

// DELETE /api/bug-reports/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM bug_reports WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
