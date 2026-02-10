import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import RelativeForm from "../RelativeForm";

const EditRelative = () => {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect");

  return (
    <RelativeForm
      mode="EDIT"
      param={params}
      redirect={redirect ? redirect : null}
    />
  );
};

export default EditRelative;
