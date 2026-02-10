import React from "react";
import RegisterForm from "../../register/RegisterForm";
import { useParams, useSearchParams } from "react-router-dom";

const EditRegister = () => {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const model = searchParams.get("model");

  return (
    <RegisterForm
      mode="EDIT"
      param={params}
      model={model}
    />
  );
};

export default EditRegister;
