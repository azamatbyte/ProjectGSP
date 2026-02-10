import React from "react";
import { useParams } from "react-router-dom";
import AdminInfo from "../AdminInfo";

const INFO = "INFO";

const InfoAdmin = () => {
	const params = useParams();
	return (
		<AdminInfo mode={INFO} param={params}/>
	);
};

export default InfoAdmin;
