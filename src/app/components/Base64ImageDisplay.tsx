import React from "react";

const Base64ImageDisplay = ({ base64String }: { base64String: string }) => {
  // Format the Base64 string for use in the <img> tag
  const imageSrc = `data:image/png;base64,${base64String}`;

  return (
    <div className="flex items-center justify-center p-4">
      <img src={imageSrc} alt="Base64 Preview" className="rounded-lg shadow-md border" width={"140px"} height={"150px"}/>
    </div>
  );
};

export default Base64ImageDisplay;
