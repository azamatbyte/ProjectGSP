import React from "react";
import { useParams } from "react-router-dom";
import RegisterInfo from "../RegisterInfo";

const InfoRegsiter = () => {
	const params = useParams();

	return (
		<RegisterInfo param={params}/>
	);
};

export default InfoRegsiter;
