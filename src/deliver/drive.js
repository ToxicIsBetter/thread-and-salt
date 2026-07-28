'use strict';
/**
 * Files the archive copy in the client's cloud drive (OneDrive / SharePoint via
 * Microsoft Graph — the natural fit for an Entra ID tenant).
 *
 * Layout:  /{rootFolder}/{year}/{YYYY-MM Cadence}/{report}.docx
 * e.g.     /Thread & Salt Reports/2026/2026-07 Monthly/…docx
 *
 * Dry-run mirrors the same folder tree under output/drive/ so the structure can be
 * reviewed before credentials exist.
 */
const fs = require('fs');
const path = require('path');
const { getToken, graphFetch } = require('./graph');

function folderPathFor(cfg, model) {
  const root = cfg.deliver.drive.rootFolder || 'Reports';
  const lastMonth = model.meta.months[model.meta.months.length - 1];
  const year = lastMonth.slice(0, 4);
  const cadence = model.meta.cadence.charAt(0).toUpperCase() + model.meta.cadence.slice(1);
  return [root, year, `${lastMonth} ${cadence}`];
}

async function saveReport({ cfg, model, file, mode, outDir }) {
  const segments = folderPathFor(cfg, model);
  const name = path.basename(file);

  // ---- no separate archive ----
  // With a self-addressed mailbox, the mailbox IS the archive: every pack is permanently
  // stored, searchable and attachment-intact in both Sent and Inbox. A local path would be
  // wrong here because a routine's sandbox is discarded after each run.
  if ((cfg.deliver.drive.provider || 'onedrive') === 'none') {
    return {
      channel: 'drive', mode, transport: 'none',
      note: 'No separate archive — the reports mailbox retains every pack.',
    };
  }

  // ---- local folder archive (e.g. a synced OneDrive/Dropbox folder on disk) ----
  // Useful when Graph file permissions aren't available: the sync client does the upload.
  if ((cfg.deliver.drive.provider || 'onedrive') === 'local') {
    const base = cfg.deliver.drive.localPath;
    if (!base) throw new Error('deliver.drive.provider is "local" but deliver.drive.localPath is not set');
    const dir = path.resolve(base.replace(/^~/, process.env.HOME || '~'), ...segments);
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, name);
    fs.copyFileSync(file, dest);
    return { channel: 'drive', mode: 'live', transport: 'local', path: dest };
  }

  if (mode !== 'live') {
    const dir = path.join(outDir, 'drive', ...segments);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(file, path.join(dir, name));
    return {
      channel: 'drive',
      mode: 'dryrun',
      path: '/' + segments.join('/') + '/' + name,
      localMirror: path.join(dir, name),
      note: 'DRY RUN — Microsoft Graph credentials not yet configured.',
    };
  }

  const owner = encodeURIComponent(cfg.deliver.drive.driveOwnerUpn || cfg.deliver.email.senderUpn);
  const token = await getToken(cfg);

  // Create the folder chain (idempotent — existing folders are left alone).
  let parent = `/users/${owner}/drive/root`;
  for (const seg of segments) {
    try {
      await graphFetch(token, `${parent}/children`, {
        method: 'POST',
        json: { name: seg, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' },
      });
    } catch (e) {
      if (!/nameAlreadyExists|already exists|\(409\)/i.test(e.message)) throw e;
    }
    parent = `/users/${owner}/drive/root:/${segments.slice(0, segments.indexOf(seg) + 1).join('/')}:`;
  }

  const uploadPath = `/users/${owner}/drive/root:/${segments.join('/')}/${name}:/content`;
  const created = await graphFetch(token, uploadPath, {
    method: 'PUT',
    body: fs.readFileSync(file),
    headers: {
      'Content-Type': name.toLowerCase().endsWith('.pdf')
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
  });

  return {
    channel: 'drive',
    mode: 'live',
    path: '/' + segments.join('/') + '/' + name,
    webUrl: created && created.webUrl,
    id: created && created.id,
  };
}

module.exports = { saveReport, folderPathFor };
