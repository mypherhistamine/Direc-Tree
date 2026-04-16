import { useState, useEffect, useCallback, useRef } from "react";
import { loggedInvoke } from "../utils/loggedInvoke";
import { log } from "../utils/logger";
import { LdapNode } from "../models/LdapNode";
import { AttributeType } from "../models/AttributeTypeEnum";
import { findNodeRecursively } from "../utils";

/** Split a distinguished name into individual RDN components,
 *  respecting escaped commas (\,)  */
function splitDnRdns(dn: string): string[] {
	const rdns: string[] = [];
	let cur = "";
	for (let i = 0; i < dn.length; i++) {
		if (dn[i] === "," && dn[i - 1] !== "\\") {
			rdns.push(cur);
			cur = "";
		} else {
			cur += dn[i];
		}
	}
	if (cur) rdns.push(cur);
	return rdns;
}

/**
 * Custom hook that encapsulates all LDAP tree state and logic.
 * Keeps the component layer thin and focused on rendering.
 */
export function useLdapTree(treeData: LdapNode[]) {
	const [nodes, setNodes] = useState<LdapNode[]>([]);
	const [expandedNodes, setExpandedNodes] = useState<string[]>([]);
	const [selectedNode, setSelectedNode] = useState<LdapNode | null>(null);
	const [selectedAttributeContent, setSelectedAttributeContent] = useState<string | null>(null);
	const [selectedAttributeKey, setSelectedAttributeKey] = useState<string | null>(null);
	const [attributeType, setAttributeType] = useState<AttributeType>(AttributeType.String);
	const [isLoadingAttributes, setIsLoadingAttributes] = useState(false);
	const [isReloading, setIsReloading] = useState(false);
	const [showOperational, setShowOperational] = useState(false);
	/** DN marked for compare (entry A) */
	const [markedForCompare, setMarkedForCompare] = useState<string | null>(null);

	// ─── Navigation history (back / forward) ───
	const historyRef = useRef<string[]>([]);
	const historyIdxRef = useRef(-1);
	const [canGoBack, setCanGoBack] = useState(false);
	const [canGoForward, setCanGoForward] = useState(false);

	const pushHistory = useCallback((dn: string) => {
		const h = historyRef.current;
		const idx = historyIdxRef.current;
		// If we're in the middle of history, truncate forward entries
		if (idx < h.length - 1) h.splice(idx + 1);
		// Avoid consecutive duplicates
		if (h[h.length - 1] !== dn) {
			h.push(dn);
			if (h.length > 30) h.shift(); // cap
		}
		historyIdxRef.current = h.length - 1;
		setCanGoBack(historyIdxRef.current > 0);
		setCanGoForward(false);
	}, []);

	const goBack = useCallback(async () => {
		const h = historyRef.current;
		const idx = historyIdxRef.current;
		if (idx <= 0) return;
		historyIdxRef.current = idx - 1;
		const dn = h[historyIdxRef.current];
		setCanGoBack(historyIdxRef.current > 0);
		setCanGoForward(true);
		// Navigate without pushing to history
		const existing = findNodeRecursively(nodes, dn);
		if (existing) {
			setIsLoadingAttributes(true);
			try {
				const cmd = showOperational ? "fetch_node_attributes_operational" : "fetch_node_attributes";
				const attributes = await loggedInvoke<Record<string, string[]>>(cmd, { baseDn: dn });
				setSelectedNode({ ...existing, attributes });
			} finally { setIsLoadingAttributes(false); }
		} else {
			setIsLoadingAttributes(true);
			try {
				const cmd = showOperational ? "fetch_node_attributes_operational" : "fetch_node_attributes";
				const attributes = await loggedInvoke<Record<string, string[]>>(cmd, { baseDn: dn });
				setSelectedNode({ id: dn, dn, label: dn.split(",")[0], toggled: false, hasChildren: false, attributes });
			} finally { setIsLoadingAttributes(false); }
		}
	}, [nodes, showOperational]);

	const goForward = useCallback(async () => {
		const h = historyRef.current;
		const idx = historyIdxRef.current;
		if (idx >= h.length - 1) return;
		historyIdxRef.current = idx + 1;
		const dn = h[historyIdxRef.current];
		setCanGoBack(true);
		setCanGoForward(historyIdxRef.current < h.length - 1);
		const existing = findNodeRecursively(nodes, dn);
		if (existing) {
			setIsLoadingAttributes(true);
			try {
				const cmd = showOperational ? "fetch_node_attributes_operational" : "fetch_node_attributes";
				const attributes = await loggedInvoke<Record<string, string[]>>(cmd, { baseDn: dn });
				setSelectedNode({ ...existing, attributes });
			} finally { setIsLoadingAttributes(false); }
		} else {
			setIsLoadingAttributes(true);
			try {
				const cmd = showOperational ? "fetch_node_attributes_operational" : "fetch_node_attributes";
				const attributes = await loggedInvoke<Record<string, string[]>>(cmd, { baseDn: dn });
				setSelectedNode({ id: dn, dn, label: dn.split(",")[0], toggled: false, hasChildren: false, attributes });
			} finally { setIsLoadingAttributes(false); }
		}
	}, [nodes, showOperational]);

	// Sync nodes with incoming treeData prop
	useEffect(() => {
		setNodes(
			treeData.map((item, idx) => ({
				...item,
				id: item.dn,
				label: item.dn.split(",")[0],
				children: item.hasChildren
					? [
						{
							id: `placeholder-${idx}`,
							label: "",
							toggled: false,
							hasChildren: false,
							dn: "placeholder",
						},
					]
					: [],
			}))
		);
	}, [treeData]);

	const toggleNode = useCallback(
		async (nodeToToggle: LdapNode) => {
			const updateNode = async (node: LdapNode): Promise<LdapNode> => {
				if (node.dn === nodeToToggle.dn) {
					let childNodes: LdapNode[] = [];

					if (!node.toggled) {
						childNodes = await loggedInvoke<LdapNode[]>("fetch_ldap_tree", { baseDn: node.dn });
						childNodes = childNodes.map((child, idx) => ({
							...child,
							toggled: false,
							children: child.hasChildren
								? [
									{
										id: `placeholder-${child.dn}-${idx}`,
										label: "",
										toggled: false,
										hasChildren: false,
										dn: "placeholder",
									},
								]
								: [],
							id: child.dn,
							label: child.dn.split(",")[0],
						}));
					}

					return {
						...node,
						toggled: !node.toggled,
						children: node.toggled
							? // Collapsing: keep a placeholder so the caret icon remains
							  node.hasChildren
								? [
									{
										id: `placeholder-${node.dn}-collapsed`,
										label: "",
										toggled: false,
										hasChildren: false,
										dn: "placeholder",
									},
								]
								: []
							: childNodes,
					};
				}

				if (node.children && node.children.length > 0) {
					const updatedChildren = await Promise.all(node.children.map(updateNode));
					return { ...node, children: updatedChildren };
				}

				return node;
			};

			const updatedNodes = await Promise.all(nodes.map(updateNode));
			setNodes(updatedNodes);

			setExpandedNodes((prev) =>
				nodeToToggle.toggled
					? prev.filter((dn) => dn !== nodeToToggle.dn)
					: [...prev, nodeToToggle.dn]
			);
		},
		[nodes]
	);

	const fetchNodeAttributes = useCallback(async (node: LdapNode) => {
		setIsLoadingAttributes(true);
		try {
			const command = showOperational ? "fetch_node_attributes_operational" : "fetch_node_attributes";
			const attributes = await loggedInvoke<Record<string, string[]>>(command, { baseDn: node.dn });
			setSelectedNode({ ...node, attributes });
			pushHistory(node.dn);
		} finally {
			setIsLoadingAttributes(false);
		}
	}, [showOperational, pushHistory]);

	const handleItemClick = useCallback(
		async (_event: React.MouseEvent, itemId: string) => {
			const ldapNode = findNodeRecursively(nodes, itemId);
			if (ldapNode) {
				await toggleNode(ldapNode);
				await fetchNodeAttributes(ldapNode);
			}
		},
		[nodes, toggleNode, fetchNodeAttributes]
	);

	const determineAndSetAttributeType = useCallback(async (value: string) => {
		try {
			const result: AttributeType = await loggedInvoke("determine_attribute_type", { value });
			setAttributeType(result);
		} catch {
			setAttributeType(AttributeType.String);
		}
	}, []);

	const handleAttributeClick = useCallback(
		async (key: string, value: string) => {
			setSelectedAttributeContent(value);
			setSelectedAttributeKey(key);
			await determineAndSetAttributeType(value);
		},
		[determineAndSetAttributeType]
	);

	/** Re-fetch a single attribute value from LDAP for the currently selected DN + key */
	const reloadSelectedAttribute = useCallback(async () => {
		if (!selectedNode || !selectedAttributeKey) return;
		setIsReloading(true);
		try {
			const newValues: string[] = await loggedInvoke("fetch_attribute_value", {
				baseDn: selectedNode.dn,
				attributeKey: selectedAttributeKey,
			});
			const displayValue = newValues.join(", ");
			setSelectedAttributeContent(displayValue);
			// Update the attribute in the selected node so the table stays in sync
			if (selectedNode.attributes) {
				setSelectedNode({
					...selectedNode,
					attributes: { ...selectedNode.attributes, [selectedAttributeKey]: newValues },
				});
			}
			await determineAndSetAttributeType(displayValue);
		} catch (err) {
			log.error("failed to reload attribute", { dn: selectedNode?.dn, key: selectedAttributeKey, error: String(err) });
		} finally {
			setIsReloading(false);
		}
	}, [selectedNode, selectedAttributeKey, determineAndSetAttributeType]);

	const handleExportJson = useCallback(async () => {
		try {
			await loggedInvoke("get_parsed_json_tree");
		} catch (err) {
			log.error("failed to export JSON tree", { error: String(err) });
		}
	}, []);

	/** Navigate to a specific DN from search results, bookmarks, or breadcrumb clicks */
	const navigateToDn = useCallback(
		async (dn: string) => {
			const existing = findNodeRecursively(nodes, dn);
			if (existing) {
				await fetchNodeAttributes(existing);
				return;
			}
			// If node isn't in the tree yet, just fetch its attributes directly
			setIsLoadingAttributes(true);
			try {
				const command = showOperational ? "fetch_node_attributes_operational" : "fetch_node_attributes";
				const attributes = await loggedInvoke<Record<string, string[]>>(command, { baseDn: dn });
				setSelectedNode({
					id: dn,
					dn,
					label: dn.split(",")[0],
					toggled: false,
					hasChildren: false,
					attributes,
				});
				pushHistory(dn);
			} finally {
				setIsLoadingAttributes(false);
			}
		},
		[nodes, fetchNodeAttributes, showOperational, pushHistory]
	);

	/** Re-fetch attributes when operational toggle changes for the currently selected node */
	useEffect(() => {
		if (selectedNode) {
			fetchNodeAttributes(selectedNode);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [showOperational]);

	/**
	 * Expand every ancestor of `targetDn` in the tree, lazy-loading children
	 * along the way, then select and highlight the target node.
	 */
	const revealDnInTree = useCallback(
		async (targetDn: string) => {
			// 1. Find which root node owns this DN
			let rootNode: LdapNode | undefined;
			for (const n of nodes) {
				if (targetDn === n.dn || targetDn.endsWith("," + n.dn)) {
					rootNode = n;
					break;
				}
			}
			if (!rootNode) {
				// Fallback – DN outside of the current tree; just show attrs
				await navigateToDn(targetDn);
				return;
			}

			// 2. Build ancestor chain  root → … → target
			const rootRdnCount = splitDnRdns(rootNode.dn).length;
			const targetRdns = splitDnRdns(targetDn);
			const ancestors: string[] = [rootNode.dn];
			for (let i = targetRdns.length - rootRdnCount - 1; i >= 0; i--) {
				ancestors.push(targetRdns.slice(i).join(","));
			}
			// e.g. ["dc=e,dc=c", "ou=U,dc=e,dc=c", "cn=J,ou=U,dc=e,dc=c"]

			// 3. Walk the chain, expanding each parent
			let currentTree = nodes.map((n) => structuredClone(n)); // deep copy
			const newExpanded = new Set(expandedNodes);

			const updateNodeInTree = (
				tree: LdapNode[],
				dn: string,
				children: LdapNode[],
			): LdapNode[] =>
				tree.map((n) => {
					if (n.dn === dn) return { ...n, toggled: true, children };
					if (n.children?.length)
						return { ...n, children: updateNodeInTree(n.children, dn, children) };
					return n;
				});

			const formatChildren = (children: LdapNode[]): LdapNode[] =>
				children.map((child, idx) => ({
					...child,
					toggled: false,
					children: child.hasChildren
						? [
								{
									id: `placeholder-${child.dn}-${idx}`,
									label: "",
									toggled: false,
									hasChildren: false,
									dn: "placeholder",
								},
						  ]
						: [],
					id: child.dn,
					label: child.dn.split(",")[0],
				}));

			for (let a = 0; a < ancestors.length - 1; a++) {
				const parentDn = ancestors[a];
				const parentNode = findNodeRecursively(currentTree, parentDn);
				if (!parentNode) break;

				if (!parentNode.toggled) {
					const raw = await loggedInvoke<LdapNode[]>("fetch_ldap_tree", {
						baseDn: parentDn,
					});
					currentTree = updateNodeInTree(
						currentTree,
						parentDn,
						formatChildren(raw),
					);
					newExpanded.add(parentDn);
				} else {
					newExpanded.add(parentDn);
				}
			}

			// 4. Commit tree state
			setNodes(currentTree);
			setExpandedNodes(Array.from(newExpanded));

			// 5. Select the target node
			const target = findNodeRecursively(currentTree, targetDn);
			if (target) {
				await fetchNodeAttributes(target);
			} else {
				// Not found after expansion — fetch attrs directly
				const cmd = showOperational
					? "fetch_node_attributes_operational"
					: "fetch_node_attributes";
				const attributes = await loggedInvoke<Record<string, string[]>>(cmd, {
					baseDn: targetDn,
				});
				setSelectedNode({
					id: targetDn,
					dn: targetDn,
					label: targetDn.split(",")[0],
					toggled: false,
					hasChildren: false,
					attributes,
				});
			}
		},
		[nodes, expandedNodes, fetchNodeAttributes, navigateToDn, showOperational],
	);

	return {
		nodes,
		expandedNodes,
		selectedNode,
		selectedAttributeContent,
		selectedAttributeKey,
		attributeType,
		isLoadingAttributes,
		isReloading,
		showOperational,
		setShowOperational,
		markedForCompare,
		setMarkedForCompare,
		handleItemClick,
		handleAttributeClick,
		handleExportJson,
		reloadSelectedAttribute,
		navigateToDn,
		revealDnInTree,
		fetchNodeAttributes,
		goBack,
		goForward,
		canGoBack,
		canGoForward,
	};
}
