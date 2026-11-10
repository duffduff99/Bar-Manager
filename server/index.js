import path from 'node:path';
import { createApp } from './app.js';
import { hashPassword } from './auth.js';
import { DATA_DIR, UPLOAD_DIR, openDatabase } from './db.js';

const db = openDatabase(path.join(DATA_DIR, 'bar.db'));

// Optional: create the first admin from the environment instead of the setup screen.
const { ADMIN_USERNAME, ADMIN_PASSWORD } = process.env;
if (ADMIN_USERNAME && ADMIN_PASSWORD) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count === 0) {
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(
      ADMIN_USERNAME,
      hashPassword(ADMIN_PASSWORD),
    );
    console.log(`Created admin account "${ADMIN_USERNAME}".`);
  }
}

const port = Number(process.env.PORT) || 3000;
const server = createApp(db, { uploadDir: UPLOAD_DIR }).listen(port, () => {
  console.log(`Bar Manager listening on port ${port}, data in ${DATA_DIR}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
