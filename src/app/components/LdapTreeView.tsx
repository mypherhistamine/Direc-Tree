import React, { useState, useEffect, JSX } from "react";
import { LdapNode } from "../models/LdapNode";  // Ensure correct path to the LdapNode model
import { invoke } from "@tauri-apps/api/core";

interface LdapTreeViewProps {
	treeData: LdapNode[];
}

// Helper function to render each node recursively

const renderNode = (node: LdapNode, level: number, toggleNode: (node: LdapNode) => void): JSX.Element => {
	// Define an array of colors to cycle through
	const borderColors = [
		"border-blue-500",  // Level 0
		"border-green-500", // Level 1
		"border-red-500",   // Level 2
		"border-yellow-500",// Level 3
		"border-purple-500",// Level 4
		"border-pink-500",  // Level 5
		"border-indigo-500",// Level 6
	];

	// Use the level of the node to select the border color from the array
	const borderColor = borderColors[level % borderColors.length]; // Cycle through colors based on level

	return (
		<div key={node.dn} className={`ml-4`}>
			<div
				className={`flex items-center ml-${level * 8} my-1 max-w-fit inline-block transition-all`}
			>
				{/* Expand/Collapse Button */}
				{node.hasChildren && (
					<button
						onClick={() => toggleNode(node)}
						className="ml-2 text-blue-500 text-sm hover:text-blue-700"
					>
						{node.toggled ? "[-]" : "[+]"}
					</button>
				)}

				{/* Icon based on the DN type */}
				{node.dn.startsWith("cn=") ? (
					<span className="mr-1 text-yellow-500 text-sm">📁</span> // Folder icon for `cn`
				) : (
					<span className="mr-1 text-blue-500 text-sm">🔑</span> // Key icon for others
				)}

				{/* Split and render the DN parts as buttons */}
				{node.dn.split(",").map((part, index) => {
					const [key, value] = part.split("=");

					// Define colors for buttons based on the position
					let colorClass = "";
					switch (index) {
						case 0:
							colorClass = "bg-blue-100 text-blue-600"; // First part button color
							break;
						case 1:
							colorClass = "bg-green-100 text-green-600"; // Second part button color
							break;
						case 2:
							colorClass = "bg-red-100 text-red-600"; // Third part button color
							break;
						default:
							colorClass = "bg-gray-100 text-gray-600"; // Default button color
							break;
					}

					return (
						<button
							key={index}
							className={`mr-2 text-sm ${colorClass} rounded-lg px-2 py-1 hover:bg-opacity-75 focus:outline-none`}
						>
							{key}={value}
						</button>
					);
				})}
			</div>

			{/* Render children if the node is toggled */}
			{node.toggled && node.children && node.children.length > 0 && (
				<div className="ml-3">
					{node.children.map((child) =>
						renderNode(child, level + 1, toggleNode)
					)}
				</div>
			)}
		</div>);
};




const LdapTreeView: React.FC<LdapTreeViewProps> = ({ treeData }) => {
	// State to handle expanded/collapsed nodes
	const [nodes, setNodes] = useState<LdapNode[]>([]);

	// Sync the nodes state with treeData prop whenever it changes
	useEffect(() => {
		setNodes(treeData);
		console.log("nodes set -> ", nodes);
	}, [treeData]); // The state will update when treeData changes


	const toggleNode = async (nodeToToggle: LdapNode) => {
		// Update the nodes state recursively
		const updateNode = async (node: LdapNode): Promise<LdapNode> => {
			if (node.dn === nodeToToggle.dn) {
				// If this is the node we are toggling
				let childNodes: LdapNode[] = [];

				if (!node.toggled) {
					// Fetch the children only when the node is being expanded
					childNodes = await invoke<LdapNode[]>('fetch_ldap_tree', { baseDn: node.dn });

					// Add `toggled: false` for each child node to ensure they can be toggled independently
					childNodes = childNodes.map((childNode) => ({
						...childNode,
						toggled: false,  // Set the toggled state to false initially
						children: []     // Set the children to an empty array initially
					}));
					console.log("Fetched child nodes for", node.dn, ":", childNodes);
				}

				// Return the updated node with toggled state and children
				return { ...node, toggled: !node.toggled, children: childNodes };
			}

			// If the node is not the one we are toggling, recurse into its children
			if (node.children && node.children.length > 0) {
				const updatedChildren = await Promise.all(node.children.map(updateNode));
				return { ...node, children: updatedChildren }; // Return node with updated children
			}

			return node; // If no children, just return the node as it is
		};

		// Apply the update to all nodes
		const updatedNodes = await Promise.all(nodes.map(updateNode));

		// Update the state with the newly updated nodes array
		setNodes(updatedNodes);
	};


	return (
		<div className="p-4">
			<h2 className="text-xl font-semibold mb-4">10.71.129.8</h2>
			{nodes.length > 0 ? (
				nodes.map((node) => renderNode(node, 0, toggleNode)) // Render the tree starting at level 0
			) : (
				<p>Loading LDAP tree...</p>
			)}
		</div>
	);
};

export default LdapTreeView;
