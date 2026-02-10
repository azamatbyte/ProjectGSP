import React from "react";
import { useParams } from "react-router-dom";
import RelationForm from "../RelationForm";

const EditRelation = () => {
	const params = useParams();

	return (
		<RelationForm mode="EDIT" param={params}/>
	);
};

export default EditRelation;
