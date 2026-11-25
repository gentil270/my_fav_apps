import React, { useEffect, useState } from 'react';
import {
  HardDrive,
  Music,
  Film,
  Folder,
  FileJson,
  Play,
  RefreshCw,
  UploadCloud,
  Trash2,
  Pencil,
  Download,
  ExternalLink,
  Search,
  ChevronRight,
  LogOut,
  Radio,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  DriveMediaFile,
  OfflineRadioClip,
  PinboardItem,
  TrackItem,
  UserInterestsProfile,
} from '../types';
import {
  DriveAuthExpiredError,
  DriveFilterMode,
  deleteDriveFile,
  ensureKezaFolder,
  fetchDriveJsonFile,
  fetchDriveMediaBlob,
  listDriveMediaFiles,
  renameDriveFile,
  uploadBlobToDrive,
} from '../services/googleDrive';
import { GoogleSignInButton } from './GoogleSignInButton';
import { DriveConfirmModal, DrivePendingMutation } from './DriveConfirmModal';
import { TheaterTarget } from './MediaTheaterModal';

interface GoogleDriveViewProps {
  user: User | null;
  needsAuth: boolean;
  isLoggingIn: boolean;
  onLogin: () => Promise<void>;
  onLogout: () => Promise<void>;
  onAuthExpired: () => void;
  onPlayTrack: (track: TrackItem, queue?: TrackItem[]) => void;
  onOpenTheater: (target: TheaterTarget) => void;
  offlineClips: OfflineRadioClip[];
  savedPins: PinboardItem[];
  likedTracks: TrackItem[];
  interests: UserInterestsProfile;
  onRestoreBackup: (payload: {
    savedPins?: PinboardItem[];
    likedTracks?: TrackItem[];
    interests?: UserInterestsProfile;
  }) => void;
}

function formatBytes(bytesStr?: string): string {
  const num = Number(bytesStr);
  if (!Number.isFinite(num) || num <= 0) return '—';
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

export const GoogleDriveView: React.FC<GoogleDriveViewProps> = ({
  user,
  needsAuth,
  isLoggingIn,
  onLogin,
  onLogout,
  onAuthExpired,
  onPlayTrack,
  onOpenTheater,
  offlineClips,
  savedPins,
  likedTracks,
  interests,
  onRestoreBackup,
}) => {
  const [filter, setFilter] = useState<DriveFilterMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFolder, setActiveFolder] = useState<{ id: string; name: string } | null>(null);
  const [files, setFiles] = useState<DriveMediaFile[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingFileId, setLoadingFileId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [pendingMutation, setPendingMutation] = useState<DrivePendingMutation | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string>('');

  const loadFiles = async (append = false, pageToken?: string) => {
    if (needsAuth) return;
    setIsLoading(true);
    setFeedback(null);
    try {
      const res = await listDriveMediaFiles({
        filter,
        query: searchQuery,
        folderId: activeFolder?.id || null,
        pageToken,
      });
      setFiles((prev) => (append ? [...prev, ...res.files] : res.files));
      setNextPageToken(res.nextPageToken);
    } catch (err: any) {
      if (err instanceof DriveAuthExpiredError) {
        onAuthExpired();
      } else {
        setFeedback({ type: 'err', text: err?.message || 'Failed to read Google Drive files.' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!needsAuth) {
      loadFiles(false);
    } else {
      setFiles([]);
    }
  }, [needsAuth, filter, activeFolder]);

  const handlePlayDriveMedia = async (file: DriveMediaFile) => {
    setLoadingFileId(file.id);
    setFeedback(null);
    try {
      const { blob, mimeType } = await fetchDriveMediaBlob(file.id);
      const objectUrl = URL.createObjectURL(blob);

      if (file.mimeType.startsWith('video/') || mimeType.startsWith('video/')) {
        onOpenTheater({
          type: 'drive-video',
          title: file.name,
          mimeType: file.mimeType || mimeType,
          objectUrl,
          webViewLink: file.webViewLink,
        });
      } else if (file.mimeType.startsWith('audio/') || mimeType.startsWith('audio/')) {
        const track: TrackItem = {
          id: `drive_${file.id}`,
          title: file.name.replace(/\.[^/.]+$/, ''),
          artist: 'Google Drive Library',
          album: 'Personal Cloud Media',
          coverUrl: '/src/assets/images/cover_drive_vault_1795424586533.jpg',
          audioUrl: objectUrl,
          source: 'drive',
          driveFileId: file.id,
          externalUrl: file.webViewLink,
        };
        onPlayTrack(track, [track]);
      } else {
        setFeedback({ type: 'err', text: `Unsupported media format: ${file.mimeType}` });
      }
    } catch (err: any) {
      if (err instanceof DriveAuthExpiredError) {
        onAuthExpired();
      } else {
        setFeedback({ type: 'err', text: err?.message || 'Could not stream this Drive file.' });
      }
    } finally {
      setLoadingFileId(null);
    }
  };

  const handleRestoreJsonBackup = async (file: DriveMediaFile) => {
    setLoadingFileId(file.id);
    setFeedback(null);
    try {
      const payload = await fetchDriveJsonFile<any>(file.id);
      onRestoreBackup({
        savedPins: Array.isArray(payload?.savedPins) ? payload.savedPins : undefined,
        likedTracks: Array.isArray(payload?.likedTracks) ? payload.likedTracks : undefined,
        interests: payload?.interests ? payload.interests : undefined,
      });
      setFeedback({
        type: 'ok',
        text: `Restored saved pins, liked tracks, and interests from "${file.name}".`,
      });
    } catch (err: any) {
      if (err instanceof DriveAuthExpiredError) onAuthExpired();
      else setFeedback({ type: 'err', text: err?.message || 'Failed to restore backup file.' });
    } finally {
      setLoadingFileId(null);
    }
  };

  const requestBackupToDrive = () => {
    const backupName = 'KEZA_Global_Stream_Backup.json';
    const existingBackup = files.find((f) => f.name === backupName);
    setPendingMutation({
      kind: 'backup',
      title: existingBackup
        ? 'Overwrite Google Drive Backup?'
        : 'Save Library Backup to Google Drive?',
      description: existingBackup
        ? `This will update "${backupName}" inside your "KEZA Global Stream" Google Drive folder with ${likedTracks.length} liked tracks, ${savedPins.length} pinned songs, and your current IP & Interests profile.`
        : `This will create "${backupName}" inside a "KEZA Global Stream" folder in your Google Drive containing ${likedTracks.length} liked tracks, ${savedPins.length} pinned songs, and your current interests.`,
      targetNames: [backupName],
      confirmLabel: existingBackup ? 'Confirm Overwrite' : 'Save to Drive',
      onConfirm: async () => {
        const folder = await ensureKezaFolder();
        const payload = JSON.stringify(
          {
            app: 'KEZA Global Stream',
            exportedAt: new Date().toISOString(),
            likedTracks,
            savedPins,
            interests,
          },
          null,
          2
        );
        await uploadBlobToDrive({
          name: backupName,
          mimeType: 'application/json',
          content: payload,
          folderId: folder.id,
          existingFileId: existingBackup?.id,
        });
        setFeedback({
          type: 'ok',
          text: `Saved "${backupName}" to your Google Drive folder (${folder.name}).`,
        });
        await loadFiles(false);
      },
    });
  };

  const requestUploadRadioClip = () => {
    const clip = offlineClips.find((c) => c.id === selectedClipId) || offlineClips[0];
    if (!clip || !clip.blob) {
      setFeedback({ type: 'err', text: 'No saved offline radio clip available to upload.' });
      return;
    }
    const ext = clip.mimeType.includes('ogg') ? 'ogg' : clip.mimeType.includes('webm') ? 'webm' : 'mp3';
    const safeName = `${clip.title.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 48)}.${ext}`;
    setPendingMutation({
      kind: 'upload-radio',
      title: 'Upload Offline Radio Recording to Google Drive?',
      description: `This will upload your offline radio audio clip (${formatBytes(
        String(clip.sizeBytes)
      )}) into your "KEZA Global Stream" Google Drive folder.`,
      targetNames: [safeName],
      confirmLabel: 'Upload Clip',
      onConfirm: async () => {
        const folder = await ensureKezaFolder();
        await uploadBlobToDrive({
          name: safeName,
          mimeType: clip.mimeType || 'audio/mpeg',
          content: clip.blob!,
          folderId: folder.id,
        });
        setFeedback({
          type: 'ok',
          text: `Uploaded "${safeName}" to your Google Drive folder.`,
        });
        await loadFiles(false);
      },
    });
  };

  const requestRenameFile = (file: DriveMediaFile) => {
    setPendingMutation({
      kind: 'rename',
      title: 'Rename Google Drive File?',
      description: `Enter a new name for this Google Drive file. Only files created or opened by KEZA Global Stream can be renamed.`,
      targetNames: [file.name],
      inputLabel: 'New file name',
      initialInputValue: file.name,
      confirmLabel: 'Rename File',
      onConfirm: async (newName) => {
        if (!newName || newName === file.name) return;
        await renameDriveFile(file.id, newName);
        setFeedback({ type: 'ok', text: `Renamed "${file.name}" to "${newName}".` });
        await loadFiles(false);
      },
    });
  };

  const requestDeleteFile = (file: DriveMediaFile) => {
    setPendingMutation({
      kind: 'delete',
      title: 'Delete File from Google Drive?',
      description:
        'Are you sure you want to permanently delete this file from Google Drive? This action cannot be undone.',
      targetNames: [file.name],
      confirmLabel: 'Delete File',
      isDestructive: true,
      onConfirm: async () => {
        await deleteDriveFile(file.id);
        setFeedback({ type: 'ok', text: `Deleted "${file.name}" from Google Drive.` });
        setFiles((prev) => prev.filter((f) => f.id !== file.id));
      },
    });
  };

  if (needsAuth) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <div className="rounded-2xl border border-white/[0.08] bg-[#111827] overflow-hidden grid md:grid-cols-2 items-stretch">
          <div className="p-8 flex flex-col justify-center">
            <p className="text-xs font-medium text-amber-400">Personal Cloud Media</p>
            <h1 className="mt-2 text-2xl sm:text-3xl font-bold text-slate-50 text-balance">
              Google Drive Media Vault
            </h1>
            <p className="mt-3 text-sm text-slate-300 leading-relaxed">
              Connect your Google Drive to stream your personal MP3, FLAC, WAV, and MP4 media
              inside KEZA Global Stream, and back up your saved playlists, pins, and offline
              radio recordings to a dedicated cloud folder.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <GoogleSignInButton
                onClick={onLogin}
                disabled={isLoggingIn}
                label={isLoggingIn ? 'Signing in...' : 'Sign in with Google'}
              />
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Tokens remain strictly in session memory and clear automatically when you sign out.
            </p>
          </div>
          <div className="relative min-h-[260px]">
            <img
              src="/src/assets/images/cover_drive_vault_1795424586533.jpg"
              alt="Brushed storage drive and studio reference headphones"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#090D16]/70 via-transparent to-transparent" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Cloud Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <HardDrive className="w-3.5 h-3.5 text-amber-400" />
            <span>{user?.email || 'Connected Google Account'}</span>
            {activeFolder && (
              <>
                <ChevronRight className="w-3.5 h-3.5" />
                <button
                  type="button"
                  onClick={() => setActiveFolder(null)}
                  className="text-amber-300 hover:underline cursor-pointer"
                >
                  All Drive Media
                </button>
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="text-slate-200">{activeFolder.name}</span>
              </>
            )}
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-50">Google Drive Vault</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={requestBackupToDrive}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 px-3.5 py-2 text-xs font-semibold text-slate-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Backup Library to Drive</span>
          </button>

          {offlineClips.length > 0 && (
            <div className="flex items-center gap-1.5">
              <select
                value={selectedClipId || offlineClips[0]?.id || ''}
                onChange={(e) => setSelectedClipId(e.target.value)}
                aria-label="Choose offline radio clip to upload"
                className="rounded-lg border border-white/10 bg-[#111827] px-2.5 py-2 text-xs text-slate-200 max-w-[160px]"
              >
                {offlineClips.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={requestUploadRadioClip}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#111827] hover:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Radio className="w-3.5 h-3.5 text-amber-400" />
                <span>Upload Radio Clip</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => loadFiles(false)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#111827] hover:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-lg border px-4 py-3 text-xs font-medium ${
            feedback.type === 'ok'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              : 'border-red-500/30 bg-red-500/10 text-red-200'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Filter Tabs + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-[#111827] border border-white/[0.08] overflow-x-auto">
          {(
            [
              ['all', 'All Media'],
              ['audio', 'Audio'],
              ['video', 'Video'],
              ['backups', 'Backups'],
              ['folders', 'Folders'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setActiveFolder(null);
                setFilter(id);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filter === id && !activeFolder
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            loadFiles(false);
          }}
          className="flex items-center gap-2"
        >
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Drive files..."
              className="rounded-lg border border-white/10 bg-[#111827] pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none w-56"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg border border-white/10 bg-[#111827] hover:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 cursor-pointer"
          >
            Search
          </button>
        </form>
      </div>

      {/* File Table */}
      <div className="rounded-xl border border-white/[0.08] bg-[#111827] overflow-hidden">
        {isLoading && files.length === 0 ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-10 rounded bg-white/[0.04] animate-pulse" />
            ))}
          </div>
        ) : files.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-200">
              No matching files found in Google Drive
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Upload audio or video files to your Drive, or click Backup Library to Drive to create
              your KEZA Global Stream cloud folder.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.08] text-[11px] font-medium text-slate-400">
                  <th className="py-3 px-4">File</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4 text-right">Size</th>
                  <th className="py-3 px-4">Modified</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] text-xs">
                {files.map((file) => {
                  const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                  const isAudio = file.mimeType.startsWith('audio/');
                  const isVideo = file.mimeType.startsWith('video/');
                  const isJson = file.mimeType === 'application/json' || file.name.endsWith('.json');
                  const canMutate = file.capabilities?.canDelete || file.capabilities?.canRename || file.ownedByMe;

                  return (
                    <tr
                      key={file.id}
                      className="hover:bg-white/[0.03] transition-colors"
                    >
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {isFolder ? (
                            <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                          ) : isAudio ? (
                            <Music className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : isVideo ? (
                            <Film className="w-4 h-4 text-sky-400 shrink-0" />
                          ) : (
                            <FileJson className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                          <span className="font-medium text-slate-100 truncate max-w-xs">
                            {file.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-slate-400 whitespace-nowrap">
                        {isFolder
                          ? 'Folder'
                          : isAudio
                          ? 'Audio'
                          : isVideo
                          ? 'Video'
                          : isJson
                          ? 'JSON Backup'
                          : file.mimeType}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">
                        {isFolder ? '—' : formatBytes(file.size)}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-slate-400 whitespace-nowrap">
                        {file.modifiedTime
                          ? new Date(file.modifiedTime).toLocaleDateString()
                          : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {isFolder && (
                            <button
                              type="button"
                              onClick={() => setActiveFolder({ id: file.id, name: file.name })}
                              className="rounded px-2.5 py-1 bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 font-medium cursor-pointer"
                            >
                              Open
                            </button>
                          )}
                          {(isAudio || isVideo) && (
                            <button
                              type="button"
                              disabled={loadingFileId === file.id}
                              onClick={() => handlePlayDriveMedia(file)}
                              className="inline-flex items-center gap-1 rounded px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold cursor-pointer disabled:opacity-50"
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span>{loadingFileId === file.id ? 'Loading...' : 'Play'}</span>
                            </button>
                          )}
                          {isJson && (
                            <button
                              type="button"
                              disabled={loadingFileId === file.id}
                              onClick={() => handleRestoreJsonBackup(file)}
                              className="inline-flex items-center gap-1 rounded px-2.5 py-1 bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 font-medium cursor-pointer"
                            >
                              <Download className="w-3 h-3" />
                              <span>Restore</span>
                            </button>
                          )}
                          {canMutate && !isFolder && (
                            <>
                              <button
                                type="button"
                                onClick={() => requestRenameFile(file)}
                                className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] cursor-pointer"
                                title="Rename file"
                                aria-label={`Rename ${file.name}`}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => requestDeleteFile(file)}
                                className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                                title="Delete file"
                                aria-label={`Delete ${file.name}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          {file.webViewLink && (
                            <a
                              href={file.webViewLink}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-white/[0.06]"
                              title="Open in Google Drive"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {nextPageToken && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => loadFiles(true, nextPageToken)}
            disabled={isLoading}
            className="rounded-lg border border-white/10 bg-[#111827] hover:bg-slate-800 px-4 py-2 text-xs font-medium text-slate-200 cursor-pointer"
          >
            {isLoading ? 'Loading more...' : 'Load More Drive Files'}
          </button>
        </div>
      )}

      <DriveConfirmModal
        mutation={pendingMutation}
        onCancel={() => setPendingMutation(null)}
      />
    </div>
  );
};
