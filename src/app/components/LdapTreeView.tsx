import React, { useState, useEffect, JSX } from "react";
import { LdapNode } from "../models/LdapNode"; // Ensure correct path to the LdapNode model
import { invoke } from "@tauri-apps/api/core";

interface LdapTreeViewProps {
	treeData: LdapNode[];
}

const LdapTreeView: React.FC<LdapTreeViewProps> = ({ treeData }) => {
	// State to handle expanded/collapsed nodes
	const [nodes, setNodes] = useState<LdapNode[]>([]);
	const [selectedNode, setSelectedNode] = useState<LdapNode | null>(null); // State for selected node
	const [selectedAttributeContent, setSelectedAttributeContent] = useState<string | null>(null);
	const [selectedAttributeKey, setSelectedAttributeKey] = useState<string | null>(null);

	// Sync the nodes state with treeData prop whenever it changes
	useEffect(() => {
		setNodes(treeData);
	}, [treeData]);

	const toggleNode = async (nodeToToggle: LdapNode) => {
		const updateNode = async (node: LdapNode): Promise<LdapNode> => {
			if (node.dn === nodeToToggle.dn) {
				let childNodes: LdapNode[] = [];
				if (!node.toggled) {
					childNodes = await invoke<LdapNode[]>("fetch_ldap_tree", { baseDn: node.dn });
					childNodes = childNodes.map((childNode) => ({
						...childNode,
						toggled: false,
						children: [],
					}));
				}
				return { ...node, toggled: !node.toggled, children: childNodes };
			}
			if (node.children && node.children.length > 0) {
				const updatedChildren = await Promise.all(node.children.map(updateNode));
				return { ...node, children: updatedChildren };
			}
			return node;
		};
		const updatedNodes = await Promise.all(nodes.map(updateNode));
		setNodes(updatedNodes);
	};

	const handleNodeClick = async (node: LdapNode) => {
		// Fetch attributes for the selected node
		const attributes = await invoke<Record<string, string>>("fetch_node_attributes", { baseDn: node.dn });
		setSelectedNode({ ...node, attributes }); // Update state with the selected node and its attributes
	};

	const renderNode = (node: LdapNode, level: number): JSX.Element => {
		// const borderColors = ["border-blue-500", "border-green-500", "border-red-500", "border-yellow-500"];
		// const borderColor = borderColors[level % borderColors.length];

		return (
			<div key={node.dn} className="ml-4">
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

					{/* Node Icon */}
					{node.dn.startsWith("cn=") ? (
						<span className="mr-1 text-yellow-500 text-sm">📁</span>
					) : (
						<span className="mr-1 text-blue-500 text-sm">🔑</span>
					)}

					{/* Node DN */}
					<button
						className={`text-sm bg-blue-100 text-blue-600 rounded-lg px-2 py-1 hover:bg-opacity-75 focus:outline-none`}
						onClick={() => handleNodeClick(node)} // Handle click to select node
						id={node.dn}
					>
						{node.dn.split(",")[0]}
					</button>
				</div>

				{/* Render Children */}
				{node.toggled && node.children && node.children.length > 0 && (
					<div className="ml-3">
						{node.children.map((child) => renderNode(child, level + 1))}
					</div>
				)}
			</div>
		);
	};

	const handleAttributeClick = (key: string, value: string) => {
		// Here, you can either return the value or fetch additional data if necessary
		setSelectedAttributeContent(value); // Set the full content for display in the right column
		setSelectedAttributeKey(key);
	};

	return (
		<div className="flex h-screen">
			{/* Tree View */}
			<div className="w-1/3 border-r">
				<div className="h-full overflow-y-auto custom-scrollbar">
					{nodes.length > 0 ? (
						nodes.map((node) => renderNode(node, 0))
					) : (
						<p>Loading LDAP tree...</p>
					)}
				</div>
			</div>

			{/* Node Details */}
			<div className="flex p-4">
				{/* Table Section */}
				<div className="">
					<h2 className="text-xl font-semibold mb-4">Node Details</h2>
					{selectedNode ? (
						<div>
							<div className="overflow-x-auto rounded-lg">
								<table className="table-auto border-collapse border border-gray-300 w-full max-w-full rounded-lg">
									<thead className="bg-gray-200">
										<tr>
											<th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold text-gray-600">
												Attribute
											</th>
											<th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold text-gray-600">
												Value
											</th>
										</tr>
									</thead>
									<tbody>
										{selectedNode.attributes &&
											Object.entries(selectedNode.attributes).map(([key, value], index) => (
												<tr
													key={key}
													className={`${index % 2 === 0 ? "bg-white" : "bg-gray-50"
														} hover:bg-gray-100 transition-all`}
												>
													<td className="border border-gray-300 px-4 py-2 font-medium text-sm text-gray-700">
														{key}
													</td>
													<td
														className="border border-gray-300 px-4 py-2 text-sm text-gray-600 truncate overflow-hidden max-w-xs"
														title={value} // Tooltip to display full value
														onClick={() => handleAttributeClick(key, value)}
													>
														{value}
													</td>
												</tr>
											))}
									</tbody>
								</table>
							</div>
						</div>
					) : (
						<p className="text-gray-500">Select a node to see its details.</p>
					)}
				</div>

				{/* New Column for Full Content */}
				<div className="pl-4 max-w-full overflow-hidden">
					<h3 className="text-xl font-semibold mb-4">Full Content</h3>
					{selectedAttributeContent ? (
						<div className="overflow-auto max-h-[300px] p-4 border border-gray-300 rounded-lg bg-gray-50">
							<pre className="whitespace-pre-wrap break-words text-gray-600">{selectedAttributeContent}</pre>
						</div>
					) : (
						<p className="text-gray-500">Click on an attribute to see its full content.</p>
					)}
				</div>
			</div>

			{/* XML Viewer */}
			{/* { */}
			{/**/}
			{/* 	selectedAttributeKey?.includes("nidsImage") ? */}
			{/* 		<XMLViewer xml={selectedAttributeContent!} ></XMLViewer> : null */}
			{/* } */}
			{/* selectedAttributeKey?.includes("nidsImage") !== null ? <XMLViewer xml="<hello></hello>" /> : null */}

		</div >


	);

};

export default LdapTreeView;
