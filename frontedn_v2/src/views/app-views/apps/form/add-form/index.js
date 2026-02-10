import React from "react";
import { useParams } from "react-router-dom";
import FormForm from "../FormForm";

const EditForm = () => {
	const params = useParams();

	return (
		<FormForm mode="ADD" param={params}/>
	);
};

export default EditForm;
