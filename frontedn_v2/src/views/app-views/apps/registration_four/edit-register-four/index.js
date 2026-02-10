import React from "react";
import { useParams } from "react-router-dom";
import RegistrationFourForm from "../RegistrationFourForm";

const EditRegisterFour = () => {
	const params = useParams();

	return (
		<RegistrationFourForm params={params} mode="EDIT"/>
	);
};

export default EditRegisterFour;
