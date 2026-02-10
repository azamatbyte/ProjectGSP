import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import RelativeForm from "../RelativeForm";

const AddRelative = () => {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect");
  const searchParamsData = searchParams.get("search");
  const oldRedirect = searchParams.get("oldRedirect");
  return (
    <RelativeForm
      mode="ADD"
      param={params}
      redirect={redirect ? redirect : null}
      oldRedirect={oldRedirect ? oldRedirect : null}
      search={searchParamsData}
    />
  );
};

export default AddRelative;
