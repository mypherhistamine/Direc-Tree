import React, { useState } from 'react';
import { LdapNode } from '../models/LdapNode';
import { FolderIcon, FolderOpenIcon, FolderPlusIcon, GiftTopIcon, HeartIcon, PlusIcon } from '@heroicons/react/16/solid';

interface LdapTreeViewProps {
	treeData: LdapNode[]; // Accept the tree data as a prop
}

const LdapTreeView: React.FC<LdapTreeViewProps> = ({ treeData }) => {
	const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

	const toggleNode = (dn: string) => {
		setExpandedNodes((prev) => {
			const newExpandedNodes = new Set(prev);
			if (newExpandedNodes.has(dn)) {
				newExpandedNodes.delete(dn);
			} else {
				newExpandedNodes.add(dn);
			}
			return newExpandedNodes;
		});
	};

	// Function to determine the icon based on the starting prefix of the DN
	const getDnIcon = (dn: string) => {
		if (dn.startsWith('cn=')) {
			return <FolderIcon className="w-4 h-4 text-gray-500 mr-2" />;
		} else if (dn.startsWith('ou=')) {
			return <GiftTopIcon className="w-4 h-4 text-gray-500 mr-2" />;
		} else {
			return <PlusIcon className="w-4 h-4 text-gray-500 mr-2" />;
		}
	};

	// Function to render the DN with colors and icons
	const renderDnWithColors = (dn: string) => {
		const colors = [
			'text-blue-500',
			'text-green-500',
			'text-red-500',
			'text-purple-500',
			'text-yellow-500',
			'text-teal-500',
		];

		return (
			<span className="flex items-center flex-wrap">
				<span className={`${colors[0]} mr-2`}>
					{getDnIcon(dn)}
					{dn}
				</span>
			</span>
		);
	};

	const renderLdapTree = (node: LdapNode) => {
		const isExpanded = expandedNodes.has(node.dn);

		return (
			<li key={node.dn} className="ml-4 list-none">
				<div
					className="flex items-center cursor-pointer hover:bg-gray-100 p-2 rounded-md transition-all duration-200"
					onClick={() => toggleNode(node.dn)}
				>
					<span
						className={`mr-2 text-gray-500 ${isExpanded ? 'text-blue-600' : 'text-gray-500'}`}
					>
						{isExpanded ? '[-]' : '[+]'}</span>
					<strong className="text-sm sm:text-base text-gray-800">{renderDnWithColors(node.dn)}</strong>
				</div>

				{/* <div className="ml-6"> */}
				{/* 	<strong className="text-gray-700">Attributes:</strong> */}
				{/* 	<ul className="list-disc pl-5 text-sm text-gray-600"> */}
				{/* 		{node.attributes.map((attr, index) => ( */}
				{/* 			<li key={index} className="text-sm">{attr}</li> */}
				{/* 		))} */}
				{/* 	</ul> */}
				{/* </div> */}
				{/**/}
				{isExpanded && node.children.length > 0 && (
					<ul className="ml-6">{node.children.map((childNode) => renderLdapTree(childNode))}</ul>
				)}
			</li>
		);
	};

	return (
		<div className="p-4 bg-white rounded-lg shadow-md w-full max-w-4xl mx-auto">
			<h2 className="text-2xl font-semibold text-gray-800 mb-4">LDAP Tree View</h2>
			<ul className="space-y-2">
				{treeData.length > 0 ? treeData.map(renderLdapTree) : <p className="text-gray-500">Loading LDAP tree...</p>}
			</ul>
		</div>
	);
};

export default LdapTreeView;
