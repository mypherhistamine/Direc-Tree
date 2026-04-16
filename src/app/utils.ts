import { styled } from "@mui/material/styles";
import { LdapNode } from "./models/LdapNode";
import { TreeItem, treeItemClasses } from "@mui/x-tree-view";

export const findNodeRecursively = (nodeList: LdapNode[], targetDn: string): LdapNode | null => {
	for (const node of nodeList) {
		if (node.dn === targetDn) {
			return node; // Found the node
		}
		if (node.children && node.children.length > 0) {
			const foundNode = findNodeRecursively(node.children, targetDn);
			if (foundNode) {
				return foundNode; // Found in children
			}
		}
	}
	return null; // Not found
};


export const CustomTreeItem = styled(TreeItem)(({ theme }) => ({
	color: "#94a3b8", // slate-400
	[`& .${treeItemClasses.content}`]: {
		borderRadius: theme.spacing(0.7),
		padding: theme.spacing(0.3, 0.6),
		margin: theme.spacing(0.15, 0),
		transition: "background-color 0.15s ease, color 0.15s ease",
		[`& .${treeItemClasses.label}`]: {
			fontSize: "0.82rem",
			fontWeight: 500,
			color: "#cbd5e1", // slate-300
		},
		"&:hover": {
			backgroundColor: "rgba(59, 130, 246, 0.08)",
		},
		"&.Mui-selected": {
			backgroundColor: "rgba(59, 130, 246, 0.15)",
			[`& .${treeItemClasses.label}`]: {
				color: "#93c5fd", // blue-300
			},
		},
	},
	[`& .${treeItemClasses.iconContainer}`]: {
		borderRadius: "50%",
		backgroundColor: "rgba(59, 130, 246, 0.1)",
		padding: theme.spacing(0, 0.8),
		color: "#60a5fa", // blue-400
	},
	[`& .${treeItemClasses.root}`]: {
		marginLeft: theme.spacing(1.0),
		paddingLeft: theme.spacing(1),
		borderLeft: `1px dashed #334155`, // slate-700
	},
}));
