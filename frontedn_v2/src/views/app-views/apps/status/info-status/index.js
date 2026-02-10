import React from "react";
import { useParams } from "react-router-dom";
import StatusInfo from "../StatusInfo";

const InfoStatus = () => {
	const params = useParams();

	return (
		<StatusInfo param={params}/>
	);
};

export default InfoStatus;
