import React from "react";
import { useParams } from "react-router-dom";
import AdminForm from "../AdminForm";

const EditAdmin = () => {
	const params = useParams();

	return (
		<AdminForm mode="EDIT" param={params}/>
	);
};

export default EditAdmin;
