import React from "react";
import WorkForm from "../WorkForm";
import { useParams } from "react-router-dom";

const EditWork = () => {
	const params = useParams();

	return (
		<WorkForm mode="EDIT" param={params}/>
	);
};

export default EditWork;
