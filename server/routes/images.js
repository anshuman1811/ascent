const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/index');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '../../data/uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB per file
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// POST /api/images — upload one or more images for an entity
router.post('/', upload.array('images', 20), (req, res) => {
  const { entity_type, entity_id } = req.body;
  if (!entity_type || !entity_id) return res.status(400).json({ error: 'entity_type and entity_id required' });
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

  const entityId = parseInt(entity_id);
  const maxOrder = db.prepare(
    'SELECT COALESCE(MAX(order_index), -1) as m FROM images WHERE entity_type = ? AND entity_id = ?'
  ).get(entity_type, entityId).m;

  const insert = db.prepare(
    'INSERT INTO images (entity_type, entity_id, filename, caption, order_index) VALUES (?, ?, ?, ?, ?)'
  );

  const created = req.files.map((file, i) => {
    const result = insert.run(entity_type, entityId, file.filename, null, maxOrder + 1 + i);
    return { id: result.lastInsertRowid, entity_type, entity_id: entityId, filename: file.filename, caption: null, url: `/uploads/${file.filename}` };
  });

  res.json(created);
});

// GET /api/images/:entityType/:entityId — list images for an entity
router.get('/:entityType/:entityId', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM images WHERE entity_type = ? AND entity_id = ? ORDER BY order_index ASC, id ASC'
  ).all(req.params.entityType, parseInt(req.params.entityId));
  res.json(rows.map(r => ({ ...r, url: `/uploads/${r.filename}` })));
});

// PATCH /api/images/:id — update caption
router.patch('/:id', (req, res) => {
  const { caption } = req.body;
  db.prepare('UPDATE images SET caption = ? WHERE id = ?').run(caption ?? null, parseInt(req.params.id));
  res.json({ ok: true });
});

// DELETE /api/images/:id — delete record + file
router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM images WHERE id = ?').get(parseInt(req.params.id));
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM images WHERE id = ?').run(row.id);
  const filePath = path.join(UPLOADS_DIR, row.filename);
  fs.unlink(filePath, () => {}); // ignore if already gone
  res.json({ ok: true });
});

module.exports = router;
