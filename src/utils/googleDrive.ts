export interface DriveUploadedFile {
  id: string;
  name: string;
  webViewLink?: string;
  webContentLink?: string;
  size?: string;
  createdTime?: string;
}

export class DriveAuthExpiredError extends Error {
  constructor(message = 'Sesi Google Drive berakhir. Silakan Sign in with Google ulang.') {
    super(message);
    this.name = 'DriveAuthExpiredError';
  }
}

const STUDIO_FOLDER_NAME = 'Fakta Nusantara Studio';

async function ensureStudioFolder(accessToken: string): Promise<string> {
  const query = encodeURIComponent(
    `name='${STUDIO_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&pageSize=1`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (searchRes.status === 401) {
    throw new DriveAuthExpiredError();
  }
  if (!searchRes.ok) {
    const err = await searchRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gagal memeriksa folder Google Drive (${searchRes.status}).`);
  }

  const searchData = (await searchRes.json()) as { files?: { id: string; name: string }[] };
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: STUDIO_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  if (createRes.status === 401) {
    throw new DriveAuthExpiredError();
  }
  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gagal membuat folder di Google Drive (${createRes.status}).`);
  }

  const folder = (await createRes.json()) as { id: string };
  return folder.id;
}

function putBlobWithProgress(
  uploadUrl: string,
  blob: Blob,
  mimeType: string,
  onProgress?: (pct: number) => void
): Promise<DriveUploadedFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', mimeType);

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && evt.total > 0 && onProgress) {
        onProgress(Math.min(99, Math.round((evt.loaded / evt.total) * 100)));
      }
    };

    xhr.onload = () => {
      if (xhr.status === 401) {
        reject(new DriveAuthExpiredError());
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const parsed = JSON.parse(xhr.responseText) as DriveUploadedFile;
          if (onProgress) onProgress(100);
          resolve(parsed);
        } catch {
          reject(new Error('Respons unggahan Google Drive tidak valid.'));
        }
      } else {
        reject(new Error(`Gagal mengunggah video ke Google Drive (${xhr.status}).`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Koneksi terputus saat mengunggah video ke Google Drive.'));
    };

    xhr.send(blob);
  });
}

async function uploadMultipartFallback(
  accessToken: string,
  metadata: Record<string, unknown>,
  blob: Blob,
  mimeType: string
): Promise<DriveUploadedFile> {
  const boundary = `fakta_drive_${Date.now()}`;
  const headerPart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`;
  const footerPart = `\r\n--${boundary}--`;
  const multipartBody = new Blob([headerPart, blob, footerPart]);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink,size,createdTime',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );

  if (res.status === 401) {
    throw new DriveAuthExpiredError();
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gagal menyimpan file ke Google Drive (${res.status}).`);
  }
  return (await res.json()) as DriveUploadedFile;
}

export async function uploadVideoToDrive(
  accessToken: string,
  videoBlob: Blob,
  filename: string,
  onProgress?: (pct: number) => void
): Promise<DriveUploadedFile> {
  const mimeType = 'video/mp4';
  const safeName = filename.toLowerCase().endsWith('.mp4') ? filename : `${filename}.mp4`;
  if (onProgress) onProgress(4);

  const folderId = await ensureStudioFolder(accessToken);
  if (onProgress) onProgress(10);

  const metadata = {
    name: safeName,
    mimeType,
    parents: [folderId],
    description: 'Video MP4 siap upload media sosial dari Fakta Nusantara Studio',
  };

  const initRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink,webContentLink,size,createdTime',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(videoBlob.size),
      },
      body: JSON.stringify(metadata),
    }
  );

  if (initRes.status === 401) {
    throw new DriveAuthExpiredError();
  }
  if (!initRes.ok) {
    const err = await initRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gagal memulai unggahan Google Drive (${initRes.status}).`);
  }

  const uploadUrl = initRes.headers.get('Location');
  if (!uploadUrl) {
    const uploaded = await uploadMultipartFallback(accessToken, metadata, videoBlob, mimeType);
    if (onProgress) onProgress(100);
    return uploaded;
  }

  return await putBlobWithProgress(uploadUrl, videoBlob, mimeType, (pct) => {
    if (onProgress) onProgress(Math.max(10, pct));
  });
}

export async function listSavedDriveVideos(accessToken: string): Promise<DriveUploadedFile[]> {
  const query = encodeURIComponent("mimeType='video/mp4' and trashed=false");
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=createdTime desc&pageSize=6&fields=files(id,name,webViewLink,webContentLink,size,createdTime)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (res.status === 401) {
    throw new DriveAuthExpiredError();
  }
  if (!res.ok) {
    return [];
  }
  const data = (await res.json()) as { files?: DriveUploadedFile[] };
  return data.files ?? [];
}
