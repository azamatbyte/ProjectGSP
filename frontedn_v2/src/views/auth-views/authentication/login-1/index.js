import React from "react";
import LoginForm from "../../components/LoginForm";
import { Card, Row, Col } from "antd";
import { useSelector } from "react-redux";

const backgroundStyle = {
	backgroundImage: "url(/img/others/img-17.jpg)",
	// backgroundImage: "url(/img/Flag111.png)",
	backgroundRepeat: "no-repeat",
	backgroundSize: "cover",
	backgroundPosition: "center"
};

const LoginOne = props => {
	const theme = useSelector(state => state.theme.currentTheme);
	return (
		<div className="h-100" style={backgroundStyle}>
			<div className="container d-flex flex-column justify-content-center h-100">
				<Row justify="center">
					<Col xs={20} sm={20} md={20} lg={7}>
						<Card>
							<div className="my-4">
								<div className="text-center">
									<img className="img-fluid w-50 h-50" src={`/img/${theme === "light" ? "gsbp_white.png": "gsbp.png"}`} alt="" />
									{/* <p>Don't have an account yet? <a href="/auth/register-1">Sign Up</a></p> */}
								</div>
								<Row justify="center">
									<Col xs={24} sm={24} md={20} lg={20}>
										<LoginForm otherSignIn={false} {...props} />
									</Col>
								</Row>
							</div>
						</Card>
					</Col>
				</Row>
			</div>
		</div>
	);
};

export default LoginOne;
