import React from "react";
import { useParams } from "react-router-dom";
import RelationInfo from "../RelationInfo";

const InfoRelation = () => {
	const params = useParams();

	return (
		<RelationInfo param={params}/>
	);
};

export default InfoRelation;
