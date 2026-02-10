import React from "react";
import { useParams } from "react-router-dom";
import StatusForm from "../StatusForm";

const EditStatus = () => {
	const params = useParams();

	return (
		<StatusForm mode="ADD" param={params}/>
	);
};

export default EditStatus;
