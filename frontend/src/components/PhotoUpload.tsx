"use client";

import { useState, useCallback } from "react";
import * as exifr from "exifr";
import { computeImageHash, computeMetadataHash } from "@/utils/hash";

export interface PhotoData {
  file: File;
  buffer: ArrayBuffer;
  imageHash: `0x${string}`;
  metadataHash: `0x${string}`;
  timestamp: string;
  lat: number;
  lng: number;
}

interface Props {
  walletAddress: string;
  onPhotoReady: (data: PhotoData) => void;
}

export function PhotoUpload({ walletAddress, onPhotoReady }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setLoading(true);

      try {
        const buffer = await file.arrayBuffer();
        setPreview(URL.createObjectURL(file));

        const exif = await exifr.parse(buffer, {
          pick: ["GPSLatitude", "GPSLongitude", "DateTimeOriginal"],
        });

        if (!exif?.GPSLatitude || !exif?.GPSLongitude || !exif?.DateTimeOriginal) {
          setError(
            "No GPS or timestamp found in this image's EXIF data. Only photos taken with location enabled can be registered."
          );
          setLoading(false);
          return;
        }

        const lat = Array.isArray(exif.GPSLatitude)
          ? exif.GPSLatitude[0] + exif.GPSLatitude[1] / 60 + exif.GPSLatitude[2] / 3600
          : exif.GPSLatitude;
        const lng = Array.isArray(exif.GPSLongitude)
          ? exif.GPSLongitude[0] + exif.GPSLongitude[1] / 60 + exif.GPSLongitude[2] / 3600
          : exif.GPSLongitude;

        const timestamp =
          exif.DateTimeOriginal instanceof Date
            ? exif.DateTimeOriginal.toISOString()
            : String(exif.DateTimeOriginal);

        const [imageHash, metadataHash] = await Promise.all([
          computeImageHash(buffer),
          computeMetadataHash(timestamp, lat, lng, walletAddress),
        ]);

        onPhotoReady({ file, buffer, imageHash, metadataHash, timestamp, lat, lng });
      } catch (err) {
        setError("Failed to process image. Please try another file.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [walletAddress, onPhotoReady]
  );

  return (
    <div className="space-y-4">
      <label className="block cursor-pointer">
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-orange-500/25 bg-orange-500/[0.04] px-6 py-10 hover:border-orange-500/50 hover:bg-orange-500/[0.07] transition-colors">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="preview" className="max-h-48 rounded-lg object-contain" />
          ) : (
            <>
              <svg className="mb-3 h-9 w-9 text-orange-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <span className="text-sm text-[#a89f96]">Click to upload a photo</span>
              <span className="mt-1 text-xs text-[#6b6259]">JPEG or PNG with GPS EXIF data</span>
            </>
          )}
        </div>
        <input
          type="file"
          accept="image/jpeg,image/png"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </label>

      {loading && (
        <p className="text-sm text-orange-400">Reading EXIF data and computing hashes…</p>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.07] px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
