import { alpha, styled } from "@mui/material/styles";
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
	color: "gray",  // Use theme's primary text color
	[`& .${treeItemClasses.content}`]: {
		borderRadius: theme.spacing(0.5),
		padding: theme.spacing(0.2, 0.5),
		margin: theme.spacing(0.2, 0),
		[`& .${treeItemClasses.label}`]: {
			fontSize: "0.9rem",
			fontWeight: 500,
		},
	},
	[`& .${treeItemClasses.iconContainer}`]: {
		borderRadius: "50%",
		backgroundColor:
			theme.palette.mode === "dark"
				? theme.palette.primary.light
				: alpha(theme.palette.primary.main, 0.20), // Conditional styling for light/dark mode
		padding: theme.spacing(0, 1),
		color: theme.palette.mode === "dark" ? theme.palette.primary.contrastText : theme.palette.primary.main,
	},
	[`& .${treeItemClasses.root}`]: {
		marginLeft: theme.spacing(1.0),
		paddingLeft: theme.spacing(1),
		// borderLeft: `2px solid ${alpha(theme.palette.text.primary, 0.4)}`, // Dashed border for grouping
		borderLeft: `1px dashed gray`, // Dashed border for grouping
	},
}));
