import React, { useEffect, useState } from "react";
import { LdapNode } from "../models/LdapNode";
import { invoke } from "@tauri-apps/api/core";
import { RichTreeView } from "@mui/x-tree-view";
import { CustomTreeItem, findNodeRecursively } from "../utils";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Base64ImageDisplay from "./Base64ImageDisplay";
import { Resizable, ResizableBox } from 'react-resizable';
import "react-resizable/css/styles.css";
import { CustomResizeHandle } from "../ux/CustomResizeHandle";
import JsonView from '@uiw/react-json-view';
import { AttributeType } from "../models/AttributeTypeEnum";

interface LdapTreeViewProps {
	treeData: LdapNode[];
}

const LdapTreeView: React.FC<LdapTreeViewProps> = ({ treeData }) => {
	const [nodes, setNodes] = useState<LdapNode[]>([]);
	const [expandedNodes, setExpandedNodes] = useState<string[]>([]); // To track expanded nodes
	const [selectedNode, setSelectedNode] = useState<LdapNode | null>(null);
	const [selectedAttributeContent, setSelectedAttributeContent] = useState<string | null>(null);
	const [selectedAttributeKey, setSelectedAttributeKey] = useState<string | null>(null);
	const [treeViewWidth, setTreeViewWidth] = useState(450); // Initial width
	const [attributeType, setAttributeType] = useState(AttributeType.String);

	// Sync the nodes state with treeData prop whenever it changes
	useEffect(() => {

		console.log("treedata -> ", treeData)
		setNodes(
			treeData.map((item, idx) => ({
				...item,
				id: item.dn,
				label: item.dn.split(",")[0],
				children: item.hasChildren ? [{
					id: `child-${idx}`,
					label: "Loading...",
					toggled: false,
					hasChildren: true,
					dn: "othing",                   // Distinguished Name (DN)
				}] : []
			}))
		);

		//also if there are expandedNodes we will toggle that as well
	}, [treeData]);



	const toggleNode = async (nodeToToggle: LdapNode) => {
		const updateNode = async (node: LdapNode): Promise<LdapNode> => {
			// If this is the node to toggle
			if (node.dn === nodeToToggle.dn) {
				let childNodes: LdapNode[] = [
					{
						id: `child-${node.dn}`,
						label: "Loading child...",
						toggled: false,
						hasChildren: true,
						dn: "loading",
					},
				];

				if (!node.toggled) {
					// Fetch children only when opening the node
					childNodes = await invoke<LdapNode[]>("fetch_ldap_tree", { baseDn: node.dn });
					childNodes = childNodes.map((childNode, idx) => ({
						...childNode,
						toggled: false, // Initialize child nodes as closed
						children: childNode.hasChildren
							? [
								{
									id: `child-${childNode.dn}-${idx}`,
									label: "Loading inside toggled child...",
									toggled: false,
									hasChildren: false,
									dn: "loading",
								},
							]
							: [],
						id: childNode.dn,
						label: childNode.dn.split(",")[0], // Simplified label
					}));
				}

				// Return updated node while preserving `hasChildren`
				return {
					...node,
					toggled: !node.toggled,
					children: node.toggled ? [] : childNodes, // Clear children only visually when toggling closed
				};
			}

			// Recursively update children if present
			if (node.children && node.children.length > 0) {
				const updatedChildren = await Promise.all(node.children.map(updateNode));
				return { ...node, children: updatedChildren };
			}

			// Return unchanged node
			return node;
		};

		// Update the tree nodes
		const updatedNodes = await Promise.all(nodes.map(updateNode));
		setNodes(updatedNodes);

		// Update expanded nodes
		setExpandedNodes((prevExpanded) => {
			if (nodeToToggle.toggled) {
				// If closing, remove from expanded list
				return prevExpanded.filter((dn) => dn !== nodeToToggle.dn);
			} else {
				// If opening, add to expanded list
				return [...prevExpanded, nodeToToggle.dn];
			}
		});
	};

	const handleNodeClick = async (node: LdapNode) => {
		const attributes = await invoke<Record<string, string>>("fetch_node_attributes", { baseDn: node.dn });
		setSelectedNode({ ...node, attributes });
	};

	const handleItemClick = async (_event: React.MouseEvent, itemId: string) => {
		const ldapNode = findNodeRecursively(nodes, itemId);
		if (ldapNode) {
			await toggleNode(ldapNode);
			await handleNodeClick(ldapNode);
		} else {
			console.log("not found in current parent node finding in child nodes");
		}
	};


	const determineAttributeType = async (attributeValue: string) => {
		// Call the Rust function via Tauri's `invoke` API
		if (selectedAttributeContent) {
			const result: AttributeType = await invoke('determine_attribute_type', { value: attributeValue });
			console.log("the type is ", result)
			setAttributeType(result)
		}

	}

	const handleAttributeClick = async (key: string, value: string) => {
		setSelectedAttributeContent(value);
		setSelectedAttributeKey(key)
		await determineAttributeType(value);
	};

	return (
		<div className="flex h-screen bg-gray-100">

			<div className="flex h-screen bg-gray-100">
				<Resizable
					width={treeViewWidth}
					height={Infinity}
					minConstraints={[200, Infinity]}
					maxConstraints={[600, Infinity]}
					axis="x"
					onResize={(e, { size }) => {
						console.log("resiing the component")
						setTreeViewWidth(size.width); // Manage the width state manually
					}}
					resizeHandles={["e"]}
				>
					<div
						style={{
							width: `${treeViewWidth}px`, // Dynamically update the width
							height: "100%",
						}}
						className="border-r border-red-700 bg-white shadow-md overflow-y-auto"
					>
						<RichTreeView
							slots={{ item: CustomTreeItem }}
							className="h-full overflow-y-auto text-white"
							items={nodes}
							expandedItems={expandedNodes}
							onItemClick={(event, itemId) => handleItemClick(event, itemId)}
						/>
					</div>
				</Resizable>
			</div>
			{/* Node Details Section */}
			<div className="flex flex-col gap-2 overflow-hidden">
				{/* Attributes Table */}
				<Card className="flex-grow bg-white shadow-lg border border-gray-300 overflow-hidden">
					<CardContent>
						<Typography variant="h6" component="h3" className="mb-4 text-gray-600">
							Node Details
						</Typography>
						{selectedNode ? (
							<div className="overflow-y-auto h-screen">
								<table className="table-auto border-collapse border border-gray-300 w-full">
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
													className={`
														${index % 2 === 0 ? "bg-white" : "bg-gray-50"} 
														${key === selectedAttributeKey ? "bg-blue-100 font-bold" : "hover:bg-gray-100"} 
														transition-all
													`}
													onClick={async () => handleAttributeClick(key, value)}
												>
													<td className="border border-gray-300 px-4 py-2 font-medium text-sm text-gray-700">
														{key}
													</td>
													<td
														className="border border-gray-300 px-4 py-2 text-sm text-gray-600 truncate overflow-hidden"
														style={{ maxWidth: "300px" }} // Limit width of cell content
														title={value}
													>
														{value}
													</td>
												</tr>
											))}
									</tbody>
								</table>
							</div>
						) : (
							<p className="text-gray-500">Select a node to see its details.</p>
						)}
					</CardContent>
				</Card>

				{/* Full Attribute Content */}
				<Card className="flex-grow bg-white shadow-lg border border-gray-300 overflow-hidden">
					<CardContent>
						<Typography variant="h6" component="h3" className="mb-4 text-gray-800">
							Full Content
						</Typography>
						{selectedAttributeContent ? (
							<div className="overflow-auto max-h-[400px] max-w-[600px] p-4 border border-gray-300 rounded-lg bg-gray-50 shadow-sm">
								<pre className="whitespace-pre-wrap break-words text-gray-700 text-sm">
									{selectedAttributeContent}
								</pre>
							</div>
						) : (
							<p className="text-gray-500">Click on an attribute to see its full content.</p>
						)}
					</CardContent>
				</Card>
			</div>


			{/* XML Viewer Section */}
			{/* <div className="min-w-[400px] max-w-[500px] bg-gray-300 overflow-auto p-2 border border-gray-300 rounded-lg shadow-lg mx-4 my-4"> */}
			{/* 	<XMLViewer className="bg-gray-200" xml={selectedAttributeContent!} indentSize={4} indentUseTabs={false} /> */}
			{/* </div> */}


			{
				attributeType === AttributeType.Json && selectedAttributeContent ?
					<div className="m-4 p-4">
						<JsonView value={JSON.parse(selectedAttributeContent)}
							displayDataTypes={false}

						/>
					</div>
					: null
			}

			{/* Show the image Viewer */}
			{
				attributeType === AttributeType.Base64 && selectedAttributeContent ?
					<Base64ImageDisplay base64String={selectedAttributeContent}></Base64ImageDisplay> : null
			}
		</div>

	);
};

export default LdapTreeView;
