import styled from "@emotion/styled";
import { MEDIA_QUERIES } from "constants/ThemeConstant";

const NavEdge = styled.div(({left, right}) => {

	if (left) {
		return {
			display: "flex"
		};
	}

	if (right) {
		return {
			marginLeft: "auto",
			padding: "0 1rem",
			display: "flex",
			[`@media ${MEDIA_QUERIES.TABLET}`]: {
				padding: "0 0.5rem"
			}
		};
	}

	return {};
});

export default NavEdge;
