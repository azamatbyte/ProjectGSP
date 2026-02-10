import React from "react";
import { useParams } from "react-router-dom";
import WorkInfo from "../WorkInfo";

const InfoWork = () => {
	const params = useParams();

	return (
		<WorkInfo param={params}/>
	);
};

export default InfoWork;
