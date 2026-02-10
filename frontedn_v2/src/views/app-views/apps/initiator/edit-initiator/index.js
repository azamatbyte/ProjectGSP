import React from "react";
import { useParams } from "react-router-dom";
import InitiatorForm from "../InitiatorForm";

const EditInitiator = () => {
	const params = useParams();

	return (
		<InitiatorForm mode="EDIT" param={params}/>
	);
};

export default EditInitiator;
