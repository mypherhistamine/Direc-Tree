'use client'
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import LdapTreeView from "./components/LdapTreeView";
import { LdapNode } from "./models/LdapNode";


export default function Home() {

	const [ldapEntries, setLdapEntries] = useState([]);
	const [ldapTree, setLdapTree] = useState<LdapNode[]>([]);



	const connectLdap = async () => {
		console.log("Connecting to the ldap connection")
		// await invoke<void>('connect_ldap');
		await invoke('connect_ldap');
		console.log("connected to the ldap connection")
	}



	const getLdapObjects = async () => {
		console.log("get_all_ldap_objects being called")
		const entries = await invoke<[]>('get_all_ldap_objects')
		setLdapEntries(entries);
	}


	const fetchLdapTree = async () => {
		await connectLdap();
		console.log("fetching tree data");
		try {
			invoke<LdapNode[]>('fetch_ldap_tree', { baseDn: 'o=novell' }).then((tree) => {
				console.log('Fetched LDAP Tree:', tree);
				setLdapTree(tree); // Set the tree data into state
			}) // Adjust type if needed

		} catch (error) {
			console.error('Error fetching LDAP tree:', error);
		}
	};

	// Call fetchLdapTree when component mounts
	useEffect(() => {
		fetchLdapTree();
	}, []);


	return (
		<div className="grid grid-rows-[auto_1fr_auto] items-center  min-h-screen p-8 gap-8 sm:p-16 font-[var(--font-geist-sans)]">

			{/* Connect to server button */}
			{/* <button */}
			{/* 	className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-6 rounded-full shadow-md transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-blue-300" */}
			{/* 	onClick={connectLdap} */}
			{/* > */}
			{/* 	Connect eDir */}
			{/* </button> */}

			{/* Get entries button */}
			{/* <button */}
			{/* 	className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-6 rounded-full shadow-md transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-blue-300" */}
			{/* 	onClick={getLdapObjects} */}
			{/* > */}
			{/* 	Get Entries */}
			{/* </button> */}


			<button
				className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-6 rounded-full shadow-md transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-blue-300"
				onClick={fetchLdapTree}
			>
				Fetch Tree
			</button>

			{/* LDAP Tree view */}
			<LdapTreeView treeData={ldapTree} />

			{/* LDAP entries display */}
			{/* <div className="w-full space-y-2 text-center"> */}
			{/* 	{ldapEntries.length > 0 ? ( */}
			{/* 		ldapEntries.map((entry, key) => ( */}
			{/* 			<p key={key} className="text-sm sm:text-base text-gray-800 font-medium">{entry}</p> */}
			{/* 		)) */}
			{/* 	) : ( */}
			{/* 		<p className="text-gray-500">No LDAP entries available</p> */}
			{/* 	)} */}
			{/* </div> */}
		</div>
	);

}
