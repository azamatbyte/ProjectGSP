import React from "react";
import RegisterForm from "../RegisterForm";
import RegisterForm4 from "../Register4Form";
import { useSearchParams } from "react-router-dom";

const AddRegister = () => {
  const [searchParams] = useSearchParams();
  const model = searchParams.get("model");
  if (model === "registration4") {
    return <RegisterForm4 mode="ADD" model={model} />;
  } else {
    return <RegisterForm mode="ADD" model={model} />;
  }
};

export default AddRegister;
