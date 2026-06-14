import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Trash2, ChevronLeft, ChevronRight, ImageIcon } from 'lucide-react';
import { api } from '../../api/client';

interface Image {
  id: number;
  entity_type: string;
  entity_id: number;
  filename: string;
  caption: string | null;
  url: string;
  order_index: number;
}

interface Props {
  entityType: 'food' | 'meal' | 'exercise';
  entityId: number;
  /** compact: smaller thumbnails, used inside list cards */
  compact?: boolean;
}

export default function ImageGallery({ entityType, entityId, compact = false }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [lightbox, setLightbox] = useState<number | null>(null); // image index in array
  const [caption, setCaption] = useState('');

  const queryKey = ['images', entityType, entityId];

  const { data: images = [] } = useQuery<Image[]>({
    queryKey,
    queryFn: () => api.get(`/images/${entityType}/${entityId}`),
  });

  const upload = useMutation({
    mutationFn: (files: FileList) => {
      const fd = new FormData();
      fd.append('entity_type', entityType);
      fd.append('entity_id', String(entityId));
      Array.from(files).forEach(f => fd.append('images', f));
      return api.upload<Image[]>('/images', fd);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const updateCaption = useMutation({
    mutationFn: ({ id, caption }: { id: number; caption: string }) =>
      api.patch(`/images/${id}`, { caption }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const deleteImage = useMutation({
    mutationFn: (id: number) => api.delete(`/images/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setLightbox(null);
    },
  });

  const openLightbox = (idx: number) => {
    setLightbox(idx);
    setCaption(images[idx]?.caption ?? '');
  };

  const closeLightbox = () => {
    if (lightbox !== null && images[lightbox]) {
      const img = images[lightbox];
      const trimmed = caption.trim();
      if (trimmed !== (img.caption ?? '')) {
        updateCaption.mutate({ id: img.id, caption: trimmed });
      }
    }
    setLightbox(null);
  };

  const shift = (delta: number) => {
    if (lightbox === null) return;
    const next = lightbox + delta;
    if (next >= 0 && next < images.length) openLightbox(next);
  };

  const thumbSize = compact ? 'w-14 h-14' : 'w-20 h-20';
  const addSize  = compact ? 'w-14 h-14' : 'w-20 h-20';

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        {images.map((img, idx) => (
          <button
            key={img.id}
            onClick={() => openLightbox(idx)}
            className={`${thumbSize} rounded-xl overflow-hidden border border-gray-700 hover:border-indigo-500 transition-colors shrink-0 relative group`}
          >
            <img
              src={img.url}
              alt={img.caption ?? ''}
              className="w-full h-full object-cover"
            />
            {img.caption && (
              <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[9px] text-gray-200 truncate px-1 py-0.5">
                {img.caption}
              </div>
            )}
          </button>
        ))}

        <button
          onClick={() => fileRef.current?.click()}
          disabled={upload.isPending}
          className={`${addSize} rounded-xl border border-dashed border-gray-700 hover:border-indigo-500 flex flex-col items-center justify-center gap-1 text-gray-600 hover:text-indigo-400 transition-colors shrink-0`}
        >
          {upload.isPending ? (
            <span className="text-[10px] text-gray-500">Uploading…</span>
          ) : (
            <>
              <Plus size={compact ? 14 : 18} />
              {!compact && <span className="text-[10px]">Add photo</span>}
            </>
          )}
        </button>

        {images.length === 0 && !compact && (
          <div className="flex items-center gap-2 text-xs text-gray-600 ml-1 self-center">
            <ImageIcon size={14} />
            No photos yet
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => {
          if (e.target.files?.length) {
            upload.mutate(e.target.files);
            e.target.value = '';
          }
        }}
      />

      {/* Lightbox */}
      {lightbox !== null && images[lightbox] && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col"
          onClick={closeLightbox}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0" onClick={e => e.stopPropagation()}>
            <span className="text-xs text-gray-400">{lightbox + 1} / {images.length}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { if (confirm('Delete this photo?')) deleteImage.mutate(images[lightbox!].id); }}
                className="p-2 rounded-lg bg-gray-800 text-red-400 hover:bg-gray-700"
              >
                <Trash2 size={16} />
              </button>
              <button onClick={closeLightbox} className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Image */}
          <div className="flex-1 flex items-center justify-center relative px-12 overflow-hidden" onClick={e => e.stopPropagation()}>
            {lightbox > 0 && (
              <button onClick={() => shift(-1)} className="absolute left-2 p-2 rounded-full bg-gray-800/70 text-white hover:bg-gray-700">
                <ChevronLeft size={20} />
              </button>
            )}
            <img
              src={images[lightbox].url}
              alt={images[lightbox].caption ?? ''}
              className="max-w-full max-h-full object-contain rounded-xl"
            />
            {lightbox < images.length - 1 && (
              <button onClick={() => shift(1)} className="absolute right-2 p-2 rounded-full bg-gray-800/70 text-white hover:bg-gray-700">
                <ChevronRight size={20} />
              </button>
            )}
          </div>

          {/* Caption */}
          <div className="px-4 py-3 shrink-0" onClick={e => e.stopPropagation()}>
            <input
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              placeholder="Add a caption…"
              value={caption}
              onChange={e => setCaption(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') closeLightbox(); }}
            />
          </div>
        </div>
      )}
    </>
  );
}
