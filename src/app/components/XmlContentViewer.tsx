import React from "react";
import XMLViewer from "react-xml-viewer";

interface XmlContentViewerProps {
	xml: string;
}

const customTheme = {
	attributeKeyColor: "#93c5fd",   // blue-300
	attributeValueColor: "#86efac", // green-300
	cdataColor: "#d1d5db",          // gray-300
	commentColor: "#6b7280",        // gray-500
	separatorColor: "#4b5563",      // gray-600
	tagColor: "#f9a8d4",            // pink-300
	textColor: "#e5e7eb",           // gray-200
	overflowBreak: true,
};

const XmlContentViewer: React.FC<XmlContentViewerProps> = ({ xml }) => {
	return (
		<div className="xml-viewer-container h-full overflow-auto custom-scrollbar">
			<XMLViewer
				xml={xml}
				indentSize={2}
				theme={customTheme}
				collapsible
			/>
		</div>
	);
};

export default XmlContentViewer;
