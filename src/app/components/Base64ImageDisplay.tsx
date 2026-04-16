import React from "react";

const Base64ImageDisplay = ({ base64String }: { base64String: string }) => {
  const imageSrc = `data:image/png;base64,${base64String}`;

  return (
    <div className="flex flex-col items-center justify-center gap-3 p-6">
      <div className="rounded-xl overflow-hidden border border-slate-700/50 shadow-lg shadow-black/20 bg-slate-800/50 p-3">
        <img
          src={imageSrc}
          alt="Base64 Preview"
          className="rounded-lg max-w-[260px] max-h-[260px] object-contain"
        />
      </div>
      <span className="text-xs text-slate-500">Base64 decoded image</span>
    </div>
  );
};

export default Base64ImageDisplay;
