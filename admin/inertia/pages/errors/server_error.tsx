export default function ServerError(props: { error: any }) {
  return (
    <>
      <div className="container">
        <div className="title">Ошибка сервера</div>

        <span>{props.error.message}</span>
      </div>
    </>
  )
}